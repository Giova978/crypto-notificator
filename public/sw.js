self.addEventListener("push", (event) => {
    const { body, title, url, ms } = event.data.json();

    const date = new Date(ms);
    const dateString = `${date.getDate()}/${date.getMonth() + 1}`;
    const time = `${date.getHours()}:${date.getMinutes()}`;

    const options = {
        vibrate: [200, 100, 200],
        body: `${body} | ${dateString} ${time}`,
        data: url,
    };

    event.waitUntil(self.registration.showNotification(title, options));
});

self.addEventListener("notificationclick", (event) => {
    event.notification.close();

    event.waitUntil(clients.openWindow(event.notification.data));
});
