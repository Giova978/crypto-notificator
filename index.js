const { writeFileSync } = require("fs");
const { history } = require("yahoo-stocks");

const { createPool } = require("mysql");
const webPush = require("web-push");
const { createHash } = require("crypto");

const express = require("express");
const cors = require("cors");
const bodyParser = require("body-parser");
const app = express();
require("dotenv").config({});

app.use(cors());
app.use(bodyParser.json());

const connection = createPool({
    host: process.env.DB_HOST,
    user: process.env.DB_USER,
    password: process.env.DB_PASS,
    database: process.env.DB_NAME,
    connectionLimit: 10,
    port: 3306,
});

webPush.setVapidDetails("https://gmail.com", process.env.VAPID_PUBLIC_KEY, process.env.VAPID_PRIVATE_KEY);

app.get("/test", async (req, res) => {
    const subs = await getAllSubscriptions();
    console.log(subs);
});

app.post("/subscribe", async (req, res) => {
    const subHash = hash(req.body.keys.auth);

    const subscribed = await hashInDB(subHash);

    if (!subscribed) {
        if (!addSubscription(subHash, req.body)) {
            res.status(500).json({ message: "There was an error while subscribing" });
        }
    }

    res.status(200).json({ message: "Successfully subscribed" });
});

app.post("/unsubscribe", async (req, res) => {
    const subHash = hash(req.body.keys.auth);

    const subscribed = await hashInDB(subHash);

    if (subscribed) {
        if (!removeSubsciption(subHash)) {
            res.status(500).send({ message: "There was an error while unsubscribing" });
        }
    }

    res.status(200).json({ message: "Successfully unsubscribed" });
});

app.get("/", async (req, res) => {
    const data = await getData("btc-usd");
    const m5 = getM5(data);
    const m20 = getM20(data);

    const buyPoints = [];

    let shouldAdd = true;
    for (let i = 0; i < m20.length; i++) {
        if (isNaN(m20[i])) continue;

        if (m20[i] < m5[i]) {
            shouldAdd = true;
        }

        if (shouldAdd && m20[i] > m5[i]) {
            buyPoints.push(i);
            shouldAdd = false;
        }
    }

    const sellPoints = [];
    for (let i = 0; i < m20.length; i++) {
        if (isNaN(m20[i])) continue;

        if (m20[i] > m5[i]) {
            shouldAdd = true;
        }

        if (shouldAdd && m20[i] < m5[i]) {
            sellPoints.push(i);
            shouldAdd = false;
        }
    }

    let [lastStoredBuyPoint, lastStoredSellPoint] = require("./lastStoredPoints.json");

    const lastBuyPoint = buyPoints[buyPoints.length - 1];
    const lastSellPoint = sellPoints[sellPoints.length - 1];

    if (data[lastBuyPoint].date > lastStoredBuyPoint) {
        notifySubscribers(`Buy, price: ${data[lastBuyPoint].close}`);
        lastStoredBuyPoint = data[lastBuyPoint].date;
    }

    if (data[lastSellPoint].date > lastStoredSellPoint) {
        notifySubscribers(`Sell, price: ${data[lastSellPoint].close}`);
        lastStoredSellPoint = data[lastSellPoint].date;
    }

    if (data[lastBuyPoint].date === lastStoredBuyPoint || data[lastSellPoint].date === lastStoredSellPoint) {
        writeFileSync("./lastStoredPoints.json", JSON.stringify([data[lastBuyPoint].date, data[lastSellPoint].date]));
    }
});

app.listen(3000, () => console.log("Server started"));

/**
 * Takes an array of numbers and returns the average in a determined window
 * @param {Array} array - Array of numbers to be averaged
 * @param {Number} window - Window size
 * @param {Number} minPeriod - Minimum period to calculate average
 * @returns {Array} - Array of averages
 */

// Takes an array of numbers and returns the average in a determined window
function roll(array, window, minPeriod = window) {
    // Format MinPeriod and window to match index in array
    const formattedMinPeriod = minPeriod - 1;
    const formattedWindow = window - 1;

    return array.reduce((acc, currValue, index, array) => {
        if (index < formattedMinPeriod) {
            acc.push(NaN);
            return acc;
        }

        const temp = [currValue];

        // Get values respecting windows
        // Substract one from index to start in the past index as we already added currValue
        for (let i = index - 1; i >= index - formattedWindow; i--) {
            if (!array[i]) break;
            temp.push(array[i]);
        }

        const avg = temp.reduce((acc, cur) => acc + cur) / temp.length;

        acc.push(Math.round(avg * 10) / 10);
        return acc;
    }, []);
}

async function getData(crypto) {
    const { records: data } = await history(crypto, {
        interval: "15m",
        range: "1mo",
    });

    return data.map((item) => ({
        date: item.time * 1000,
        open: Math.round(item.open * 10) / 10,
        high: Math.round(item.open * 10) / 10,
        low: Math.round(item.open * 10) / 10,
        close: Math.round(item.open * 10) / 10,
    }));
}

function getM5(data) {
    return roll(
        data.map((item) => item.close),
        5,
    );
}

function getM20(data) {
    return roll(
        data.map((item) => item.close),
        20,
    );
}

const hash = (data) => createHash("sha256").update(data).digest("hex");

function hashInDB(hash) {
    return new Promise((resolve, reject) => {
        connection.query(`SELECT 1 FROM ${process.env.DB_TABLE} WHERE subHash = ?`, [hash], (err, results, fields) => {
            if (err) {
                console.log(err);
                return resolve(false);
            }

            resolve(results.length > 0);
        });
    });
}

function addSubscription(hash, sub) {
    return new Promise((resolve, reject) => {
        connection.query(
            `INSERT INTO ${process.env.DB_TABLE}  VALUES (?, ?)`,
            [hash, JSON.stringify(sub)],
            (err, results, fields) => {
                if (err) {
                    console.log(err);
                    return resolve(false);
                }

                resolve(true);
            },
        );
    });
}

function removeSubsciption(hash) {
    return new Promise((resolve, reject) => {
        connection.query(
            `DELETE FROM ${process.env.DB_TABLE} WHERE subHash = ? LIMIT 1`,
            [hash],
            (err, results, fields) => {
                if (err) {
                    console.log(err);
                    return resolve(false);
                }

                resolve(true);
            },
        );
    });
}

function getAllSubscriptions() {
    return new Promise((resolve, reject) => {
        connection.query(`SELECT subscription FROM ${process.env.DB_TABLE}`, (err, results, fields) => {
            if (err) {
                console.log(err);
                return resolve([]);
            }

            resolve(results.map((row) => JSON.parse(row.subscription)));
        });
    });
}