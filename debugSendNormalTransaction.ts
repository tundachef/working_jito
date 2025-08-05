import { sendAndConfirmTransaction, Transaction, TransactionInstruction } from "@solana/web3.js";
import { wallet, connection } from "../../helpers";

export async function debugSendNormalTransaction(instructions: TransactionInstruction[]) {
    const tx = new Transaction().add(...instructions);
    tx.feePayer = wallet.publicKey;
    tx.recentBlockhash = (await connection.getLatestBlockhash("finalized")).blockhash;

    // Sign and send
    const signature = await sendAndConfirmTransaction(connection, tx, [wallet]);

    console.log(`✅ Sent tx: https://solscan.io/tx/${signature}`);

}
