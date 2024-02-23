try {
	pref("network.proxy.no_proxies_on","");
} catch(e) {
	displayError("Test", e);
}
