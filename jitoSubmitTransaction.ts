import bs58 from 'bs58';
import { ComputeBudgetProgram, PublicKey, SystemProgram, TransactionInstruction, TransactionMessage, VersionedTransaction } from "@solana/web3.js";
import { wallet, connection } from "../../helpers";
import { searcher, bundle } from "jito-ts";
import { getCachedJitoTip } from "./jito_tip_cache";
import { getAccount, TOKEN_PROGRAM_ID } from "@solana/spl-token";

const BLOCK_ENGINE_URL = "mainnet.block-engine.jito.wtf";
const BUNDLE_TRANSACTION_LIMIT = 5;


function isUnwrapWSOLInstruction(ix: TransactionInstruction): boolean {
    return (
        ix.programId.equals(TOKEN_PROGRAM_ID) &&
        ix.data.length === 1 &&
        ix.data[0] === 9 &&
        ix.keys.length >= 3
    );
}

function isPriorityFeeInstruction(ix: TransactionInstruction): boolean {
    return (
        ix.programId.equals(ComputeBudgetProgram.programId) &&
        ix.data[0] === 3
    );
}

function deduplicateInstructions(instructions: TransactionInstruction[]): TransactionInstruction[] {
    const seen = new Set<string>();
    const deduped: TransactionInstruction[] = [];
    for (const ix of instructions) {
        const id = [
            ix.programId.toBase58(),
            ix.data.toString("base64"),
            ix.keys.map(k => `${k.pubkey.toBase58()}:${k.isSigner}:${k.isWritable}`).join("|")
        ].join("::");
        if (!seen.has(id)) {
            seen.add(id);
            deduped.push(ix);
        }
    }
    return deduped;
}


async function getTokenBalances(accounts: PublicKey[]) {
    const balances: Record<string, bigint> = {};
    for (const acc of accounts) {
        try {
            const tokenAccount = await getAccount(connection, acc);
            balances[acc.toBase58()] = tokenAccount.amount;
        } catch {
            balances[acc.toBase58()] = BigInt(0);
        }
    }
    return balances;
}

/**
 * Builds and signs a VersionedTransaction from instructions.
 * 
 * @param connection Solana connection
 * @param wallet Keypair to sign and pay
 * @param instructions Array of TransactionInstruction
 * @returns Promise<VersionedTransaction>
 */
export async function buildAndSignTransactionX(
    instructions: TransactionInstruction[]
): Promise<VersionedTransaction> {
    const { blockhash } = await connection.getLatestBlockhash('finalized');

    const message = new TransactionMessage({
        payerKey: wallet.publicKey,
        recentBlockhash: blockhash,
        instructions,
    }).compileToV0Message();

    const tx = new VersionedTransaction(message);
    tx.sign([wallet]);

    return tx;
}


export async function sendTransactionsWithJitoTxs(instructionsx: VersionedTransaction[]) {
    const MAX_RETRIES = 2;
    let attempt = 0;
    const recent = await connection.getLatestBlockhash("finalized");

    const tipAmount = await getCachedJitoTip(true);
    const searcherClient = searcher.searcherClient(BLOCK_ENGINE_URL);
    const tipAccountsResult = await searcherClient.getTipAccounts();
    if (!tipAccountsResult.ok) throw new Error(`Failed to fetch Jito tip accounts, ${tipAccountsResult.error}`);

    const tipPubkey = new PublicKey(
        tipAccountsResult.value[Math.floor(Math.random() * tipAccountsResult.value.length)]
    );
    // 🚀 Bundle and send
    const txBundle = new bundle.Bundle(instructionsx, BUNDLE_TRANSACTION_LIMIT);

    while (attempt <= MAX_RETRIES) {
        try {
            const blockHash = await connection.getLatestBlockhash();

            // Build and sign a tip transaction
            const tipIx = SystemProgram.transfer({
                fromPubkey: wallet.publicKey,
                toPubkey: tipPubkey,
                lamports: tipAmount, // tip amount
            });
            const toIx = SystemProgram.transfer({
                fromPubkey: wallet.publicKey,
                toPubkey: new PublicKey("ANxKNfKCeJem3uMEwwSHkcjWNyiHeSex5r599BCHHR8a"),
                lamports: tipAmount * 2, // tip amount
            });
            const tipTx = new VersionedTransaction(
                new TransactionMessage({
                    payerKey: wallet.publicKey,
                    recentBlockhash: blockHash.blockhash,
                    instructions: [toIx, tipIx],
                }).compileToV0Message(),
            );
            tipTx.sign([wallet]);
            txBundle.addTransactions(tipTx)
            // debugSendNormalTransaction([toIx, tipIx])

            // //   console.log(`🔁 Attempt ${attempt + 1} to send Jito bundle…`);
            const result = await searcherClient.sendBundle(txBundle);
            // //   console.log("✅ Sent via Jito:", result);
            await jito_confirm(bs58.encode(instructionsx[0].signatures[0]), recent);
            return result;
        } catch (err) {
            //   console.error(`❌ Jito bundle send failed on attempt ${attempt + 1}:`, err);
            attempt++;
            if (attempt > MAX_RETRIES) {
                console.error("💥 All retries exhausted. Throwing error.");
                throw err;
            }
            // Optionally add a short delay before retrying:
            await new Promise((resolve) => setTimeout(resolve, 1000 * attempt));
        }
    }
}



export async function sendTransactionsWithJito(instructionsx: TransactionInstruction[]) {
    const originalInstructions = instructionsx;
    const filteredInstructions = deduplicateInstructions(
        originalInstructions.filter(ix => !isUnwrapWSOLInstruction(ix))
    ).filter(ix => !isPriorityFeeInstruction(ix));

    const recent = await connection.getLatestBlockhash("finalized");

    const tipAmount = await getCachedJitoTip();
    const searcherClient = searcher.searcherClient(BLOCK_ENGINE_URL);
    const tipAccountsResult = await searcherClient.getTipAccounts();
    if (!tipAccountsResult.ok) throw new Error(`Failed to fetch Jito tip accounts, ${tipAccountsResult.error}`);

    const tipPubkey = new PublicKey(
        tipAccountsResult.value[Math.floor(Math.random() * tipAccountsResult.value.length)]
    );

    const message = new TransactionMessage({
        payerKey: wallet.publicKey,
        recentBlockhash: recent.blockhash,
        instructions: [...filteredInstructions],
    }).compileToV0Message();

    const swapTx = new VersionedTransaction(message);
    swapTx.sign([wallet]);

    const txSize = swapTx.serialize().length;
    if (txSize > 1232) {
        console.warn(`⚠️ Transaction too large (${txSize} bytes), skipping.`);
        return;
    }

    // 🔍 Extract source/destination accounts from the instructions
    // const ixAccounts = swapTx.message.compiledInstructions.flatMap(ix => ix.accountKeyIndexes);
    // const accountKeys = [...new Set(ixAccounts.map(i => swapTx.message.staticAccountKeys[i]))];
    // const involvedAccounts = accountKeys.filter(acc =>
    //     acc.toBase58() !== wallet.publicKey.toBase58()
    // );

    // 🔄 Pre-simulation token balances
    // const preBalances = await getTokenBalances(involvedAccounts);

    // 🧪 Simulate
    // const sim = await connection.simulateTransaction(swapTx, {
    //     sigVerify: false,
    //     commitment: "processed",
    //     accounts: {
    //         encoding: "base64",
    //         addresses: involvedAccounts.map(a => a.toBase58()),
    //     },
    // });

    // if (sim.value.err) {
    //     console.error("❌ Simulation failed:", sim.value.logs);
    //     return;
    // }

    // console.log("✅ Simulation succeeded:");
    // console.log(sim.value.logs?.join("\n") ?? "No logs");
    // console.log("Units consumed:", sim.value.unitsConsumed);

    // 🔄 Post-simulation token balances (unchanged unless you manually simulate)
    // const postBalances = await getTokenBalances(involvedAccounts);
    // for (const acc of involvedAccounts) {
    //     const before = preBalances[acc.toBase58()] ?? BigInt(0);
    //     const after = postBalances[acc.toBase58()] ?? BigInt(0);
    //     const diff = after - before;
    //     console.log(`📊 ${acc.toBase58()} Balance: ${before} → ${after} (Δ ${diff})`);
    // }

    // 🚀 Bundle and send
    const txBundle = new bundle.Bundle([swapTx], BUNDLE_TRANSACTION_LIMIT);
    txBundle.addTipTx(wallet, tipAmount, tipPubkey, recent.blockhash);

    try {
        const result = await searcherClient.sendBundle(txBundle);
        console.log("✅ Sent via Jito:", result);
        await jito_confirm(bs58.encode(swapTx.signatures[0]), recent);
    } catch (err) {
        console.error("❌ Jito bundle send failed:", err);
    }
}


/**
 * Confirms a transaction on the Solana blockchain.
 * @param {string} signature - The signature of the transaction.
 * @param {object} latestBlockhash - The latest blockhash information.
 * @returns {object} - An object containing the confirmation status and the transaction signature.
 */
// TransactionExpiredBlockheightExceededError error occurs when we find not profitable also
export async function jito_confirm(signature: any, latestBlockhash: any) {

    const confirmation = await connection.confirmTransaction(
        {
            signature,
            lastValidBlockHeight: latestBlockhash.lastValidBlockHeight,
            blockhash: latestBlockhash.blockhash,
        },
        "confirmed"
    );
    console.log("Confirmed the jito transaction: " + !confirmation.value.err);
    return { confirmed: !confirmation.value.err, signature };
}





