function __unload_page() {
	var xhr = new XMLHttpRequest();
	xhr.open('POST', '@@ARES_CLOSE@@', false);
	xhr.send(null);
}
window.onbeforeunload=__unload_page;

