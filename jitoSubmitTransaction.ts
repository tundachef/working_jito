import bs58 from 'bs58';
import { ComputeBudgetProgram, PublicKey, SystemProgram, TransactionMessage, VersionedTransaction } from "@solana/web3.js";
import { wallet, connection } from "../../helpers";
import { searcher, bundle } from "jito-ts";
import { getCachedJitoTip } from "./jito_tip_cache";

const BLOCK_ENGINE_URL = "mainnet.block-engine.jito.wtf";
const BUNDLE_TRANSACTION_LIMIT = 5;

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
                toPubkey: new PublicKey(), // add your alternate address here
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





