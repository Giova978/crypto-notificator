self.addEventListener("push", (event) => {
    const { body, title, url } = event.data.json();

    const options = {
        vibrate: [200, 100, 200],
        body,
        data: url,
    };

    event.waitUntil(self.registration.showNotification(title, options));
});

self.addEventListener("notificationclick", (event) => {
    event.notification.close();

    event.waitUntil(clients.openWindow(event.notification.data));
});
