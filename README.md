### Working Jito 
This is a working function to submit large VersionedTransactions using jito<br>
```Success rate: 4/5 ```
if using jupiter API
``` 
prioritizationFeeLamports: {
    priorityLevelWithMaxLamports: {
        maxLamports: 8000000, // 0.008
        global: false,
        priorityLevel: "veryHigh"
    }
}
```
### Key takeaway
This is more successful than most bundling using Jito because I never understood why no writing exists about this but i have found that by sending/transfering some Sol to a random wallet I own, in the same transaction as the one i add the tip, jito succeeds more likely, also the random send instruction should be before the tip transaction;
```
  // Build and sign a tip transaction
    const tipIx = SystemProgram.transfer({
        fromPubkey: wallet.publicKey,
        toPubkey: tipPubkey,
        lamports: tipAmount, // tip amount
    });
    const toIx = SystemProgram.transfer({
        fromPubkey: wallet.publicKey,
        toPubkey: new PublicKey(), // add address here
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
```