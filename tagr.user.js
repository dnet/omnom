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

function contentEval(source) {
  // Check for function input.
  if ('function' == typeof source) {
    // Execute this function with no arguments, by adding parentheses.
    // One set around the function, required for valid syntax, and a
    // second empty set calls the surrounded function.
    source = '(' + source + ')();';
  }

  // Create a script node holding this  source code.
  var script = document.createElement('script');
  script.setAttribute("type", "application/javascript");
  script.textContent = source;

  // Insert the script node into the page, so it will run, and immediately
  // remove it to clean up.
  document.body.appendChild(script);
  document.body.removeChild(script);
}

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
    iframe.removeEventListener("load", done, true);
    if (debug)
      console.log("IFrame %x load event after %d ms",
                  framename, (new Date)-load.start);
    var win = unsafeWindow.frames[framename];
    var doc = null;
    if(!iframe.contentWindow==null) {
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

function gotFrame(iframe, win, doc) {
  iframe.id='tagr_frame';
  var top=(WindowHeight()-512)/2;
  var left=(window.innerWidth-880)/2;
  iframe.style.cssText = 'border: 1px solid grey; background: white; position:fixed; z-index:9999; top:'+top+'px; left:'+left+'px; width: 880px; height: 512px;';
  iframe.style.display = 'none';
  toggleWidget(iframe);
}

function initWidget() {
  GM_xmlhttpRequest({ method: "head",
	                   url: "http://localhost:8001/"
                    });
  makeFrame(gotFrame,'tagr_frame',true);
  var tc = document.createElement('div');
  tc.id = 'tagr_container';
  var top=((WindowHeight()-512)/2)-18;
  var left=(window.innerWidth-880)/2;
  tc.style.cssText = 'border: 1px solid grey; background: white; position:fixed; z-index:9999; top:'+top+'px; left:'+left+'px; width: 880px; height: 18px; cursor: pointer;';
  tc.style.display = 'none';
  tc.innerHTML = '<div onclick="javascript:window.parent.document.getElementById(\'tagr_container\').style.display=\'none\';var f=window.parent.document.getElementById(\'tagr_frame\'); f.style.display=\'none\'; f.innerHTML=\'\';void(0);">[close tagr]</div>';
  document.getElementsByTagName('body')[0].appendChild(tc);
}

function toggleWidget(iframe) {
  if(iframe.style.display != 'block') {
    x=document;
    a=encodeURIComponent(x.location.href);
    t=encodeURIComponent(x.title);
    d=encodeURIComponent(getSelected());
    //var geturl = '{%root_url%}/add/';
	 //iframe.src='http://links.ctrlc.hu/add/?popup=2&amp;url='+a+'&amp;title='+t+'&amp;notes='+d;
    //iframe.innerHTML = 'Loading...';
	 iframe.src='http://localhost:8001/add/?popup=2&amp;url='+a+'&amp;title='+t+'&amp;notes='+d;
    iframe.style.display = 'block';
    document.getElementById('tagr_container').style.display='block';

    function close() {
      contentEval("console.log(window.frames[0].contentDocument.location)"); //.contentWindow.document.body);
      //if(doc.body.firstChild=="close") {
      // iframe.style.display='none';
      //}
    }
    iframe.addEventListener("load", close, true);
  } else {
    iframe.innerHTML = '';
    iframe.style.display = 'none';
    document.getElementById('tagr_container').style.display='none';
  }
}

function keyHandler(e) {
  if (e.keyCode == 68 && !e.shiftKey && e.ctrlKey && e.altKey && !e.metaKey) {
    var iframe=document.getElementById('tagr_frame');
    if(!iframe) {
      initWidget();
    } else {
      toggleWidget(iframe);
    }
  }
}


unsafeWindow.addEventListener('keydown', keyHandler, true);
