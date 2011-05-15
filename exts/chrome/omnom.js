function saveBookmark() {

}


chrome.extension.onRequest.addListener(function(request, sender, sendResponse) {
	console.log("Got request...");
	if (request.method == "getSelection")
		sendResponse({data: window.getSelection().toString()});
	else
		sendResponse({}); // snub them.
});

