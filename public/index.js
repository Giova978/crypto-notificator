async function subscribe() {
    if ("Notification" in window && "serviceWorker" in navigator) {
        if (Notification.permission === "granted") {
            setupNotification("/subscribe");
        } else {
            Notification.requestPermission().then(function (permission) {
                if (permission === "granted") {
                    setupNotification("/subscribe");
                }
            });
        }
    }
}

async function unsubscribe() {
    setupNotification("/unsubscribe");
}

async function setupNotification(endpoint) {
    const serviceWorker = await navigator.serviceWorker.register("sw.js");

    const subscription = await getSubscription(serviceWorker);

    try {
        const response = await fetch("http://localhost:3000" + endpoint, {
            headers: {
                "Content-Type": "application/json",
            },
            body: JSON.stringify(subscription),
            method: "POST",
            mode: "cors",
        });

        const data = await response.json();

        updateStatus(data.message);
    } catch (err) {
        updateStatus("An error ocurred, please try again in a while");
    }
}

async function getSubscription(serviceWorker) {
    let subscription = await serviceWorker.pushManager.getSubscription();

    if (!subscription) {
        subscription = await serviceWorker.pushManager.subscribe({
            userVisibleOnly: true,
            applicationServerKey: urlBase64ToUint8Array(
                "BJlfLhE9H-2HjzymyrGfY7ANQ526-dBpsc4OI9gd0L3yc3NUenK5nsuxzgVOBZbMFDVZTES8NdUiV1hp3C1CtEc",
            ),
        });
    }

    return subscription;
}

function updateStatus(text) {
    document.getElementById("status").innerText = text;
    setTimeout(() => {
        document.getElementById("status").innerText = "";
    }, 1500);
}

const urlBase64ToUint8Array = (base64String) => {
    const padding = "=".repeat((4 - (base64String.length % 4)) % 4);
    const base64 = (base64String + padding).replace(/-/g, "+").replace(/_/g, "/");
    const rawData = atob(base64);
    const outputArray = new Uint8Array(rawData.length);

    for (let i = 0; i < rawData.length; i += 1) {
        outputArray[i] = rawData.charCodeAt(i);
    }

    return outputArray;
};
