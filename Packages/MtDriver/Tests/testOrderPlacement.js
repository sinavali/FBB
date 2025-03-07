const testOrder = async () => {
    try {
        const response = await fetch("http://localhost:5000/place_order", {
            method: "POST",
            headers: {'Content-Type': 'application/json'},
            body: JSON.stringify({
                symbol: 'EURUSD',
                type: 'ORDER_TYPE_BUY',
                volume: 0.1,
                price: 1.04891,  // Will be ignored for market orders
                sl: 1.04760,
                tp: 1.04950
            }),
        });
        
        const result = await response.json();
        console.log("Order Result:", result);
        
    } catch (error) {
        console.error("Request Failed:", error);
    }
};

testOrder();