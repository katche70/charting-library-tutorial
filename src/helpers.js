export const API_SERVER = "https://localhost:5001";

// Make requests to CryptoCompare API
export async function makeApiRequest2(path) {
	try {
		const response = await fetch(`${API_SERVER}/api/ChartingLibary/${path}`);
		return response.json();
	} catch (error) {
		throw new Error(`ChartingLibary request error: ${error.status}`);
	}
}
