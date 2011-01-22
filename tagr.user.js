// --------------------------------------------------------------------
//
// This is a Greasemonkey user script.  To install it, you need
// Greasemonkey 0.3 or later: http://greasemonkey.mozdev.org/
// Then restart Firefox and revisit this script.
// Under Tools, there will be a new menu item to "Install User Script".
// Accept the default configuration and install.
//
// To uninstall, go to Tools/Manage User Scripts,
// select "tagr", and click Uninstall.
//
// --------------------------------------------------------------------
//
// ==UserScript==
// @name           tagr bookmarking script
// @namespace      tagr
// @include       *

// Creates a new iframe and attaches it to the DOM, waits for it to load, tests
// that we did not hit https://bugzilla.mozilla.org/show_bug.cgi?id=295813 nor
// https://bugzilla.mozilla.org/show_bug.cgi?id=388714 (and retries otherwise),
// to finally call the provided done callback, passing the iframe, its window
// and document. (The optional name parameter, if provided, will be used to name
// the iframe in window.frames, or be created as "pane-1" onwards, otherwise.)
// src: https://ecmanaut.googlecode.com/svn/trunk/lib/make-iframe.js

function makeFrame(cb/*(iframeTag, window, document)*/, name, debug) {
  function testInvasion() {
    iframe.removeEventListener("load", done, true);
    var message = ((new Date)-load.start)+ "ms passed, ";
    try { // probe for security violation error, in case mozilla struck a bug
      var url = unsafeWindow.frames[framename].location.href;
      message += url == "about:blank" ?
        "but we got the right document." :
        "and we incorrectly loaded "+ url;
      if (debug)
        console.log(message);
      done();
    }
    catch(e) {
      if (console && console.error && console.trace) {
        console.error( e );
        console.trace();
      }
      if (debug)
        console.log(message + "and our iframe was invaded. Trying again!");
      document.body.removeChild(iframe);
      makeFrame(cb, name);
    }
  }

  function done() {
    clearTimeout(load.timeout);
    if (debug)
      console.log("IFrame %x load event after %d ms",
                  framename, (new Date)-load.start);
    var win = unsafeWindow.frames[framename];
    var doc = null;
    if(!iframe.contentWindow) {
      doc = iframe.contentWindow.document;
    }
    cb( iframe, win, doc );
  }

  var iframe = document.createElement("iframe");
  var framename = iframe.name = typeof name != "undefined" ? name :
    ("pane" + (makeFrame.id = (makeFrame.id || 0) - 1));
  iframe.setAttribute("style", "overflowY:hidden; overflowX:hidden; " +
                      "z-index:9999; border:0; margin:0; padding:0; " +
                      "top:auto; right:auto; bottom:auto; left:auto;");
  iframe.src = "about:blank";
  iframe.addEventListener("load", done, true);

  var frames = makeFrame.data || {};
  var load = frames[framename] || { start:new Date, sleepFor:400 };
  load.timeout = setTimeout(testInvasion, load.sleepFor);
  load.sleepFor *= 1.5;
  frames[framename] = load;
  makeFrame.data = frames;
  document.body.appendChild(iframe);
}

function WindowHeight()
{
  var WindowHeight = 0;
  if( typeof( window.innerWidth ) == 'number' )
  WindowHeight = window.innerHeight;
  else if (document.documentElement &&  document.documentElement.clientHeight)
  WindowHeight = document.documentElement.clientHeight;
  else if(document.body && document.body.clientHeight)
  WindowHeight = document.body.clientHeight;

  return WindowHeight;
}

function getSelected() {
  var txt = '';
  if (unsafeWindow.getSelection) {
    txt = unsafeWindow.getSelection();
  } else if (document.getSelection) {
    txt = document.getSelection();
  } else if (document.selection) {
    txt = document.selection.createRange().text;
  };
  return txt;
}

function initWidget() {
  makeFrame(gotFrame,'tagr_frame');
  function gotFrame(iframe, win, doc) {
    var top=(WindowHeight()-512)/2;
    var left=(window.innerWidth-860)/2;
    iframe.style.cssText = 'border: 1px solid grey; background: white; position:fixed; z-index:9999; top:'+top+'px; left:'+left+'px; width: 880px; height: 512px;';
    iframe.style.display = 'none';
    iframe.id='tagr_frame';
    GM_xmlhttpRequest({
	                     method: "post",
	                     url: "http://localhost:8001/import",
	                     headers: { "Content-type" : "application/x-www-form-urlencoded" },
	                     data: '' //encodeURI("username="+$("username").value+"&password="+$("password").value+"&message="+$("message").value),
	                     //onload: function(e) { alert(e.responseText); }
                      });
    toggleWidget(iframe);
  }
}


function toggleWidget(iframe) {
    if(iframe.style.display != 'block') {
      x=document;
      a=encodeURIComponent(x.location.href);
      t=encodeURIComponent(x.title);
      d=encodeURIComponent(getSelected());
      //var geturl = '{%root_url%}/add/';
	   //iframe.src='http://links.ctrlc.hu/add/?popup=2&amp;url='+a+'&amp;title='+t+'&amp;notes='+d;
	   iframe.src='http://localhost:8001/add/?popup=2&amp;url='+a+'&amp;title='+t+'&amp;notes='+d;
      iframe.style.display = 'block';
    } else {
      iframe.innerHTML = '';
      iframe.style.display = 'none';
    }
}


function load(e) {
  if (e.keyCode == 68 && !e.shiftKey && e.ctrlKey && e.altKey && !e.metaKey) {
    var iframe=document.getElementById('tagr_frame');
    console.log(iframe);
    if(!iframe) {
      initWidget();
    } else {
      toggleWidget(iframe);
    }
  }
}


unsafeWindow.addEventListener('keydown', load, true);
