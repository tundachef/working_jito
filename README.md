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