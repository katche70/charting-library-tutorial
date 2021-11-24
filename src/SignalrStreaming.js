import { API_SERVER } from './helpers.js';


var token = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJodHRwOi8vc2NoZW1hcy54bWxzb2FwLm9yZy93cy8yMDA1LzA1L2lkZW50aXR5L2NsYWltcy9uYW1laWRlbnRpZmllciI6IjEwMDQyIiwiaHR0cDovL3NjaGVtYXMueG1sc29hcC5vcmcvd3MvMjAwNS8wNS9pZGVudGl0eS9jbGFpbXMvbmFtZSI6IlBhdHJpY2siLCJodHRwOi8vc2NoZW1hcy54bWxzb2FwLm9yZy93cy8yMDA1LzA1L2lkZW50aXR5L2NsYWltcy9lbWFpbGFkZHJlc3MiOiJwYXRyaWNrQGdvbGRlc2VsLmRlIiwiSW5zZXJ0RGF0ZSI6IjcvNy8yMDIxIDEwOjQ5OjM5IEFNIiwiUHJvZmlsSW1hZ2UiOiJodHRwczovL2dvbGRlc2VsLmF6dXJlZWRnZS5uZXQvdXNlci9wcm9maWxlcGljdHVyZS8xMDA0Mi5wbmc_dj0yMy0xMS0yMDIxXzIxXzA5IiwiaHR0cDovL3NjaGVtYXMubWljcm9zb2Z0LmNvbS93cy8yMDA4LzA2L2lkZW50aXR5L2NsYWltcy9yb2xlIjpbIkFkbWluIiwiUHJlbWl1bSIsImRwYS1BRlggUHJvRmVlZCJdLCJleHAiOjE2Mzc4MjY1MzAsImlzcyI6ImdvbGRlc2VsIiwiYXVkIjoiZ29sZGVzZWwifQ.1qL_3MphILW5yXUlrVuZGhlWLYppqgqg22DsHRn0phQ";
var refreshToken = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJodHRwOi8vc2NoZW1hcy54bWxzb2FwLm9yZy93cy8yMDA1LzA1L2lkZW50aXR5L2NsYWltcy9uYW1laWRlbnRpZmllciI6IjEwMDQyIiwiaXNzIjoiZ29sZGVzZWwiLCJhdWQiOiJnb2xkZXNlbCJ9.Jp9qM3dZJ33SwXiTnGfGRrkjPxufBO0GQ2WZ-mbnOaU";
var connection = new signalR.HubConnectionBuilder().withUrl(`${API_SERVER}/chatHub`, { accessTokenFactory: () => token }).withAutomaticReconnect([0, 2000, 10000, 30000, 60000]).build();
const channelToSubscription = new Map();

connection
	.start()
	.then(function () {
		afterStart();
	})
	.catch(function (err) {
		console.log('connection could not be started', connection);
		return console.error(err.toString());
	});

connection.onclose(error => {
	console.log(`Connection closed due to error ${error}, Try refreshing this page to restart the connection<`);
});

connection.onreconnecting(error => {
	console.assert(connection.state === signalR.HubConnectionState.Reconnecting);
	console.log(`Connection lost due to error "${error}". Reconnecting.`);
});
connection.onreconnected(connectionId => {
	console.assert(connection.state === signalR.HubConnectionState.Connected);
	console.log(`Connection reestablished. Connected with connectionId "${connectionId}".`);
	afterStart();
});

connection.on("Watchers", function (watchers) {
	var watchersList = JSON.parse(watchers);
	console.log(watchersList);
});
function GetWatchers() {
	connection.invoke('GetWatchers', "");
}


async function afterStart() {
	try {

	} catch (err) {
		console.log('connection could not be started', connection);
		console.error(err);
	}

}

connection.on("ReceivePriceUpdate", function (priceUpdateStr) {
	var PriceUpdate = JSON.parse(priceUpdateStr);
	if (!PriceUpdate || !PriceUpdate.isin) {
		console.log('skip all non-TRADE events');
		return;
	}
	const tradePrice = parseFloat(PriceUpdate.latest.price);
	const tradeTime = Date.parse(PriceUpdate.latest.time);
	const channelString = `${PriceUpdate.exchange}:${PriceUpdate.isin}`;
	const subscriptionItem = channelToSubscription.get(channelString);
	if (subscriptionItem === undefined) {
		return;
	}
	const lastDailyBar = subscriptionItem.lastDailyBar;
	const nextDailyBarTime = getNextDailyBarTime(lastDailyBar.time);
	//console.log('lastDailyBar', lastDailyBar);
	//console.log('nextDailyBarTime', nextDailyBarTime);

	let bar;
	if (tradeTime >= nextDailyBarTime) {
		bar = {
			time: nextDailyBarTime,
			open: tradePrice,
			high: tradePrice,
			low: tradePrice,
			close: tradePrice,
		};
		console.log('[socket] Generate new bar', bar);
	} else {
		bar = {
			...lastDailyBar,
			high: Math.max(lastDailyBar.high, tradePrice),
			low: Math.min(lastDailyBar.low, tradePrice),
			close: tradePrice,
		};
		console.log('[socket] Update the latest bar by price', tradePrice);
	}
	subscriptionItem.lastDailyBar = bar;

	// send data to every subscriber of that symbol
	subscriptionItem.handlers.forEach(handler => handler.callback(bar));
});

function getNextDailyBarTime(barTime) {
	const date = new Date(barTime * 1000);
	date.setDate(date.getDate() + 1);
	return date.getTime() / 1000;
}


export function subscribeOnStream(
	symbolInfo,
	resolution,
	onRealtimeCallback,
	subscribeUID,
	onResetCacheNeededCallback,
	lastDailyBar,
) {
	const channelString = `${symbolInfo["exchange-traded"]}:${symbolInfo.isin}`;
	const handler = {
		id: subscribeUID,
		callback: onRealtimeCallback,
	};
	let subscriptionItem = channelToSubscription.get(symbolInfo.isin);
	if (subscriptionItem) {
		// already subscribed to the channel, use the existing subscription
		subscriptionItem.handlers.push(handler);
		return;
	}
	subscriptionItem = {
		subscribeUID,
		resolution,
		lastDailyBar,
		handlers: [handler],
	};
	channelToSubscription.set(channelString, subscriptionItem);
	console.log('[subscribeBars]: Subscribe to streaming. Channel:', channelString);

	if (connection && connection.state === signalR.HubConnectionState.Connected) {
		connection.send('AddToGroup', symbolInfo.isin, "");
		console.log('[connection AddToGroup]: Subscribe to Channel:', symbolInfo.isin);
	}
}

export function unsubscribeFromStream(subscriberUID, isin) {
	// find a subscription with id === subscriberUID
	for (const channelString of channelToSubscription.keys()) {
		const subscriptionItem = channelToSubscription.get(channelString);
		const handlerIndex = subscriptionItem.handlers
			.findIndex(handler => handler.id === subscriberUID);

		if (handlerIndex !== -1) {
			// remove from handlers
			subscriptionItem.handlers.splice(handlerIndex, 1);

			if (subscriptionItem.handlers.length === 0) {
				// unsubscribe from the channel, if it was the last handler
				console.log('[unsubscribeBars]: Unsubscribe from streaming. Channel:', channelString);
				socket.emit('SubRemove', { subs: [channelString] });
				if (connection && connection.state === signalR.HubConnectionState.Connected) {
					connection.send('RemoveFromGroup', isin, "");
					console.log('[connection AddToGroup]: Subscribe to Channel:', symbolInfo.isin);
				}
				channelToSubscription.delete(channelString);
				break;
			}
		}
	}
}
