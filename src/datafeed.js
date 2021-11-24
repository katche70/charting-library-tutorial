import {
	makeApiRequest2
} from './helpers.js';

import {
	subscribeOnStream,
	unsubscribeFromStream,
} from './SignalrStreaming.js';


const lastBarsCache = new Map();
const subscribeUIDIsin = new Map();
var configurationData = {};

export default {
	onReady: async (callback) => {
		//console.log('[onReady]: Method call');
		const data = await makeApiRequest2('config');
		configurationData = data;
		setTimeout(() => callback(configurationData));
	},

	searchSymbols: async (
		userInput,
		exchange,
		symbolType,
		onResultReadyCallback,
	) => {
		//console.log('[searchSymbols]: Method call', userInput,exchange,symbolType);
		const symbols = await makeApiRequest2(`search?limit=30&query=${userInput}&type=${symbolType}&exchange=${exchange}`);
		onResultReadyCallback(symbols);
	},

	resolveSymbol: async (
		symbolName,
		onSymbolResolvedCallback,
		onResolveErrorCallback,
	) => {
		//console.log('[resolveSymbol]: Method call', symbolName);
		const symbolInfo = await makeApiRequest2(`symbols?symbol=${symbolName}`);
		if (!symbolInfo) {
			console.error('[resolveSymbol]: Cannot resolve symbol', symbolName);
			onResolveErrorCallback('cannot resolve symbol');
			return;
		}
		//console.log('[resolveSymbol]: Symbol resolved', symbolName);
		onSymbolResolvedCallback(symbolInfo);
	},

	getBars: async (symbolInfo, resolution, periodParams, onHistoryCallback, onErrorCallback) => {
		const { from, to, firstDataRequest, countBack } = periodParams;
		//console.log('[getBars]: Method call', symbolInfo, resolution, from, to, periodParams);
		const urlParameters = {
			symbol: symbolInfo.ticker,
			resolution: resolution,
			from: from,
			to: to,
			countBack: countBack,
			firstDataRequest: firstDataRequest
		};
		const query = Object.keys(urlParameters)
			.map(name => `${name}=${encodeURIComponent(urlParameters[name])}`)
			.join('&');
		try {
			const data = await makeApiRequest2(`historyJsApi?${query}`);
			if (data.Response && data.Response === 'Error' || data.bars.length === 0) {
				// "noData" should be set if there is no data in the requested period.
				onHistoryCallback([], {
					noData: true,
				});
				return;
			}
			let bars = data.bars;
			if (firstDataRequest) {
				lastBarsCache.set(symbolInfo.full_name, {
					...bars[bars.length - 1],
				});				
			}
			console.log(`[getBars]: returned ${bars.length} bar(s)`);
			//console.log(bars);
			onHistoryCallback(bars, {
				noData: false,
			});
		} catch (error) {
			console.log('[getBars]: Get error', error);
			onErrorCallback(error);
		}
	},

	subscribeBars: (
		symbolInfo,
		resolution,
		onRealtimeCallback,
		subscribeUID,
		onResetCacheNeededCallback,
	) => {
		subscribeUIDIsin.set(subscribeUID, symbolInfo.isin);
		console.log('[subscribeBars]: Method call with subscribeUID:', subscribeUID);
		console.log('[subscribeBars]: symbolInfo:', symbolInfo);
		console.log('[subscribeBars]: lastBarsCache.get(symbolInfo.full_name):', lastBarsCache.get(symbolInfo.full_name));	
		console.log('[subscribeBars]: subscribeUIDIsin:', subscribeUIDIsin.get(subscribeUID));
		subscribeOnStream(
			symbolInfo,
			resolution,
			onRealtimeCallback,
			subscribeUID,
			onResetCacheNeededCallback,
			lastBarsCache.get(symbolInfo.full_name),
		);
	},

	unsubscribeBars: (subscriberUID) => {
		console.log('[unsubscribeBars]: Method call with subscriberUID:', subscriberUID);
		console.log('[unsubscribeBars]: Isin:', subscribeUIDIsin.get(subscriberUID));
		unsubscribeFromStream(subscriberUID, subscribeUIDIsin.get(subscriberUID));
	},
};
