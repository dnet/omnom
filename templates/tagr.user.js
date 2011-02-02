{%load tagger%}// --------------------------------------------------------------------
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

(function () {
   var store;
   var delicious_user='';
   var delicious_password='';
   var fetching=0;
   var loaded=false;

   makeFrame(gotFrame, 'store');
   unsafeWindow.addEventListener('keydown', keyHandler, true);

   function keyHandler(e) {
     if (e.keyCode == 68 && !e.shiftKey && e.ctrlKey && e.altKey && !e.metaKey) {
       var tagr=window.parent.document.getElementById('tagr_div');
       if(!tagr) {
         initWidget();
       } else {
         toggleWidget(tagr);
       }
     }
   }

   function initWidget() {
     var odiv = document.createElement('div');
     odiv.id = 'tagr_div';
     odiv.style.display = 'none';

     var top=(WindowHeight()-460)/2;
     var left=(window.innerWidth-860)/2;
     odiv.style.cssText = 'border: 1px solid grey; background: white; position:fixed; z-index:9999; top:'+
       top+'px; left:'+left+'px; width: 880px; height: 460px; text-align: justify';

     var tagrframe = document.createElement('div');
     tagrframe.id = 'tagr_frame';
     odiv.appendChild(tagrframe);

     var snapstat = document.createElement('div');
     snapstat.id = 'tagr_snapshotStatus';
     snapstat.style.cssText = 'border: 1px solid grey; position: absolute; bottom: 0px; width: 100%; height: 25px; padding 3px;';
     odiv.appendChild(snapstat);
     document.getElementsByTagName('body')[0].appendChild(odiv);
     toggleWidget(odiv);
   }

   function toggleWidget(tagr) {
     if(tagr.style.display != 'block') {
       doSnapshot();
       tagr.style.background="white url("+loader+") no-repeat center center";
       tagr.style.display = 'block';
       // prefetch credentials
       GM_xmlhttpRequest({ method: "head",
                           url: "{%root_url%}",
                           onload: function(e) {
                             var x=document;
                             var a=encodeURIComponent(x.location.href);
                             var t=encodeURIComponent(x.title);
                             var d=encodeURIComponent(getSelected());

                             // load basic form
                             GM_xmlhttpRequest({ method: "get",
                                                 url: '{%root_url%}/add/?popup=2&url='+a+'&title='+t+'&notes='+d,
                                                 //var geturl = '{%root_url%}/add/';
                                                 onload: function (e) {
                                                   window.parent.document.getElementById('tagr_frame').innerHTML=e.responseText;
                                                   tagr.style.background="white";
                                                   // get tags from delicious if the user set the
                                                   // name/password combo in the beginning of this
                                                   // file.
                                                   if(delicious_user && delicious_password) {
                                                     GM_xmlhttpRequest({ method: "get",
                                                                         url: 'https://api.del.icio.us/v1/posts/suggest?url='+a,
                                                                         onload: updateSuggestedTags
                                                                       });}}

                                               });
                             // handle the submit event of the 'form'
                             window.addEventListener('submit', interceptor, true);
                           }
                         });
     } else {
       tagr.innerHTML = '';
       tagr.style.display = 'none';
       window.removeEventListener("submit", interceptor, true);
     }
   }

   function updateSuggestedTags(ev) {
     var div = document.createElement('div');
     div.style.display = 'none';
     document.body.appendChild(div);
     div.innerHTML=ev.responseText;
     unsafeWindow.addEventListener('click', tagClick, true);

     var tags=window.parent.document.getElementById('tagr_tagsuggestion');
     var elems = window.parent.document.getElementsByTagName( "recommended" );
     for(var i=0; i < elems.length; i++) {
       var span = document.createElement('span');
       span.setAttribute('class','suggestedTag');
       span.setAttribute('name',elems.item(i).innerHTML);
       span.innerHTML = elems.item(i).innerHTML;
       tags.appendChild(document.createTextNode(' '));
       tags.appendChild(span);
     }
     document.body.removeChild(div);
   }

   function tagClick(e) {
     if(e.target.getAttribute('class')=='suggestedTag') {
       var self=e.target;
       var tags=window.parent.document.getElementById('id_tags');
       if(tags.value) { tags.value+=' '; }
       tags.value+=self.getAttribute('name');
       self.style.display='none';
     }
   }

   function interceptor(e) {
     var frm = e.target;
     if (frm.id=='tagr_addForm') {
       e.stopPropagation();
       e.preventDefault();
       var csrf=encodeURIComponent(window.parent.document.getElementsByName('csrfmiddlewaretoken')[0].value);
       var url=encodeURIComponent(window.parent.document.getElementById('id_url').value);
       var title=encodeURIComponent(window.parent.document.getElementById('id_title').value);
       var notes=encodeURIComponent(window.parent.document.getElementById('id_notes').value);
       var tags=encodeURIComponent(window.parent.document.getElementById('id_tags').value);
       var priv=encodeURIComponent(window.parent.document.getElementById('id_private').value);
       // remove tagr nodes
       var tmp=store.contentDocument.getElementById("tagr_store");
       tmp.parentNode.removeChild(tmp);
       tmp=store.contentDocument.getElementById("tagr_div");
       tmp.parentNode.removeChild(tmp);
       // inline all css (link rel=styleshhet and imported ones)
       rebuildCSS();
       var snapshot=encodeURIComponent('<!DOCTYPE HTML>\n<html>'+store.contentDocument.documentElement.innerHTML+'</html>');

       // submit the form!
       GM_xmlhttpRequest({ method: 'POST',
	                        url: '{%root_url%}/add/?close=1',
                           data: 'csrfmiddlewaretoken='+csrf+'&url='+url+'&title='+title+'&notes='+notes+'&page='+snapshot,
                           headers: [{'Content-type': 'application/x-www-form-urlencoded'}],
                           onload: submitForm
                         });
	    return false;
     } else {
	    return HTMLFormElement.prototype.submit.apply(frm);
     }
   };

   function submitForm(results){
     var tagr=window.parent.document.getElementById('tagr_div');
     if(results.responseText=='close') {
       // hide the form automatically
       toggleWidget(tagr);
     } else {
       // show the response
       window.parent.document.getElementById('tagr_frame').innerHTML=results.responseText;
     }
   }

   function doSnapshot() {
     var status = window.parent.document.getElementById( "tagr_snapshotStatus" );
     status.innerHTML="Snapshotting...";
     //store.contentDocument.documentElement.innerHTML = window.document.documentElement.innerHTML;
     //store.contentDocument.write(window.document.documentElement.innerHTML);
     var head=store.wrappedJSObject.contentDocument.getElementsByTagName("head")[0];
     var orig=window.parent.document.getElementsByTagName( "head" )[0];
     var clone=store.wrappedJSObject.contentDocument.importNode(orig, true);
     head.parentNode.replaceChild(clone,head);
     var body=store.wrappedJSObject.contentDocument.getElementsByTagName("body")[0];
     orig=window.parent.document.getElementsByTagName( "body" )[0];
     clone=store.wrappedJSObject.contentDocument.importNode(orig, true);
     body.parentNode.replaceChild(clone,body);

     // embed/object?
     // convert link rel=stylesheet to <style elements>
     fetchSheets();
     // convert images to dataurls
     dumpImages();

     //dumpScripts();
     // nah rather nix them. safer.
     var elems = store.contentDocument.getElementsByTagName( "script" );
     while(elems.length) { elems[0].parentNode.removeChild(elems[0]); }

     // does this work?
     dumpCanvas();
   }

   function dumpCanvas() {
     var elems = store.contentDocument.wrappedJSObject.getElementsByTagName("canvas");
     while (elems.length) {
       var canvas=elems.item(0);
       //alert('dumping canvas'+canvas.getAttribute('id'));
       var image = new Image();
       //alert('data://'+canvas.toDataURL("image/png").slice(5));
       image.setAttribute('src','data:'+canvas.toDataURL("image/png").slice(5));
       image.setAttribute('class',canvas.getAttribute('class') || "");
       image.setAttribute('style',canvas.getAttribute('style') || "");
       image.setAttribute('id',canvas.getAttribute('id') || "");
       image.setAttribute('width',canvas.getAttribute('width') || "");
       image.setAttribute('height',canvas.getAttribute('height') || "");
       canvas.parentNode.replaceChild(image,canvas);
       //alert(elems.length);
     }
   }

   function dumpImages() {
     var elems = store.contentDocument.wrappedJSObject.getElementsByTagName( "img" );
     for(var i=0; i < elems.length; i++) {
       var img=elems.item(i);
       if(img.getAttribute('src').slice(0,5)=='data:') { continue; }
       fetchImage(img);
     }
     // also handle <input type='image'>
     elems = store.contentDocument.wrappedJSObject.getElementsByTagName( "input" );
     for(i=0; i < elems.length; i++) {
       var img=elems.item(i);
       if(img.getAttribute('type') != 'image' || img.getAttribute('src').slice(0,5)=='data:') { continue; }
       fetchImage(img);
     }
   }

   function fetchImage(img) {
     updateStatus(1);
     GM_xmlhttpRequest({ method: "get",
                         url: img.src,
                         overrideMimeType: 'text/plain; charset=x-user-defined',
                         item: img,
                         onerror: function(e) { updateStatus(-1); },
                         onload: function(e) {
                           var re = new RegExp("^Content-Type:\\s+(.*?)\\s*$", "m");
                           var matched = e.responseHeaders.match(re);
                           var dataurl='data:'+((matched)? matched[1]: "")+";base64,"+Base64.encodeBinary(e.responseText);
                           this.item.setAttribute('src',dataurl);
                           updateStatus(-1);
                           //alert('dumping img '+this.item.getAttribute('src'));
                         }});
   }

   function inlineCSSImages() {
     var elems = store.contentDocument.styleSheets;
     for(var i=0; i < elems.length; i++) {
       dumpCSSImages(elems[i],elems[i].ownerNode.getAttribute('href'));
     }
   }

   function dumpCSSImages(sheet) {
     for(var i=0; i < sheet.cssRules.length; i++) {
       if(sheet.cssRules[i].styleSheet) {
         // dive recursively into imported stylesheets. TODO check if can be exploited with endless loop
         dumpCSSImages(sheet.cssRules[i].styleSheet);
       }
       if(sheet.cssRules[i].style && sheet.cssRules[i].style.backgroundImage.match(/url(.*?)/i)) {
         // inline background-image urls
         var url=sheet.cssRules[i].style.backgroundImage.slice(4,sheet.cssRules[i].style.backgroundImage.length-1);
         // skip already inlined images
         if(url.slice(0,5)=='data:') { continue; }
         url=toAbsURI(url,sheet.href);
         updateStatus(1);
         GM_xmlhttpRequest({ method: "get",
                             url: url,
                             overrideMimeType: 'text/plain; charset=x-user-defined',
                             item: sheet.cssRules[i],
                             onerror: function(e) { updateStatus(-1); },
                             onload: function(e) {
                               var re = new RegExp("^Content-Type:\\s+(.*?)\\s*$", "m");
                               var matched = e.responseHeaders.match(re);
                               var dataurl = 'url(data:'+((matched)? matched[1]: "")+";base64,"+Base64.encodeBinary(e.responseText)+')';
                               this.item.style.backgroundImage=dataurl;
                               updateStatus(-1);
                             }});
         }
     }
   }

   function rebuildCSS() {
     var items = Array.prototype.slice.call(store.wrappedJSObject.contentDocument.styleSheets,0);
     for(var i=0; i < items.length; i++) {
       var style = store.wrappedJSObject.contentDocument.createElement("style");
       style.type=items[i].ownerNode.getAttribute('type')||"text/css";
       style.media=items[i].ownerNode.getAttribute('media')||'screen';
       style.innerHTML=dumpCSS(items[i]);
       items[i].ownerNode.parentNode.replaceChild(style,items[i].ownerNode);
     }
   }

   function dumpCSS(sheet) {
     var txt='';
     for(var i=0; i < sheet.cssRules.length; i++) {
       if(sheet.cssRules[i].styleSheet) {
         txt+='\n'+dumpCSS(sheet.cssRules[i].styleSheet);
       } else if(sheet.cssRules[i].cssText) {
         txt+='\n'+sheet.cssRules[i].cssText;
       }}
     return txt;
   }

   function updateStatus(code) {
     fetching+=code;
     var status = window.parent.document.getElementById( "tagr_snapshotStatus" );
     if(fetching) {
       status.innerHTML="Snapshotting... "+fetching+" objects";
     } else {
       status.innerHTML="Snapshot done.";
       if(!loaded) {
         loaded=true;
         inlineCSSImages();
       }
     }
   }

   function fetchSheets() {
     var elems = store.contentDocument.wrappedJSObject.getElementsByTagName( "link" );
     for(var i=0; i < elems.length; i++) {
        var src = toAbsURI(elems[i].getAttribute('href'));
        if(src && elems[i].getAttribute('rel')=='stylesheet') {
          updateStatus(1);
           GM_xmlhttpRequest({ method: "get",
              url: src,
              overrideMimeType: 'text/plain; charset=x-user-defined',
              item: elems[i],
              onerror: function(e) { updateStatus(-1); },
              onload: function(e) {
                var style = store.wrappedJSObject.contentDocument.createElement("style");
                style.setAttribute('type',this.item.type);
                style.setAttribute('media',this.item.media);
                style.setAttribute('xml:base',this.item.baseURI);
                style.innerHTML=e.responseText;
                this.item.parentNode.replaceChild(style,this.item);
                updateStatus(-1);
                //alert('dumping css '+style.innerHTML);
              }});
        }
     }
   }

   function gotFrame(iframe, win, doc) {
     iframe.style.display='none';
     iframe.id='tagr_store';
     store=iframe;
   }

   function toAbsURI(uri,base) {
     if(uri.match(/\w+:\/\//)) { return uri; }
     if(!base) base=window.document.baseURI;
     base = String(base).split("?")[0]; // strip away get params
     var tmp = base.split(':',2);
     var scheme=tmp[0];
     tmp = tmp[1].split('/');
     var host=tmp[2], path=tmp.slice(3,-1).join('/');

     if(uri.slice(0,2)=='//') {
       return scheme+'://'+uri;
     } else if(uri.slice(0,1)=='/') {
       return scheme+'://'+host+uri;
     } else if(uri.slice(0,1)=='#') {
       return base.split('#')[0]+uri;
     } else if(uri.slice(0,1)=='?') {
       return base+uri;
     }
     return scheme+'://'+host+'/'+path+'/'+uri;
   }

//   function dumpScripts() {
//     var elems = store.contentDocument.wrappedJSObject.getElementsByTagName( "script" );
//     for(var i=0; i < elems.length; i++) {
//       var src = elems[i].getAttribute('src');
//       if(src) {
//         //alert('dumping script '+src);
//         updateStatus(1);
//         GM_xmlhttpRequest({ method: "get",
//                             url: src,
//                             overrideMimeType: 'text/plain; charset=x-user-defined',
//                             item: elems[i],
//                             onerror: function(e) { updateStatus(-1); },
//                             onload: function(e) {
//                               var dataurl='data:text/javascript;base64,'+Base64.encodeBinary('//<![CDATA[\n// source: '+this.url+'\n'+e.responseText+'\n//]]>');
//                               this.item.setAttribute('src',dataurl);
//                               updateStatus(-1);
//                               //alert('dumping script '+this.item.innerHTML);
//                             }});
//       } else {
//         var dataurl='data:text/javascript;base64,'+Base64.encodeBinary(elems.item(i).innerHTML);
//         elems.item(i).setAttribute('src',dataurl);
//         elems.item(i).innerHTML=" ";
//       }
//     }
//   }

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
       iframe.removeEventListener("load", done, true);
       if (debug)
         console.log("IFrame %x load event after %d ms",
                     framename, (new Date)-load.start);
       var win = unsafeWindow.frames[framename];
       var doc = null;
       if(iframe.contentWindow) {
         doc = iframe.contentWindow.document;
       } else if(iframe.contentDocument) {
         doc = iframe.contentDocument;
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

   var Base64 = {
     // private property
     _keyStr : "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/=",

     encodeBinary : function(input){
       var output = "";
       var bytebuffer;
       var encodedCharIndexes = new Array(4);
       var inx = 0;
       var paddingBytes = 0;

       while(inx < input.length){
         // Fill byte buffer array
         bytebuffer = new Array(3);
         for(jnx = 0; jnx < bytebuffer.length; jnx++)
           if(inx < input.length)
             // throw away high-order byte, as documented at: https://developer.mozilla.org/En/Using_XMLHttpRequest#Handling_binary_data
             bytebuffer[jnx] = input.charCodeAt(inx++) & 0xff;
         else
           bytebuffer[jnx] = 0;

         // Get each encoded character, 6 bits at a time
         // index 1: first 6 bits
         encodedCharIndexes[0] = bytebuffer[0] >> 2;
         // index 2: second 6 bits (2 least significant bits from input byte 1 + 4 most significant bits from byte 2)
         encodedCharIndexes[1] = ((bytebuffer[0] & 0x3) << 4) | (bytebuffer[1] >> 4);
         // index 3: third 6 bits (4 least significant bits from input byte 2 + 2 most significant bits from byte 3)
         encodedCharIndexes[2] = ((bytebuffer[1] & 0x0f) << 2) | (bytebuffer[2] >> 6);
         // index 3: forth 6 bits (6 least significant bits from input byte 3)
         encodedCharIndexes[3] = bytebuffer[2] & 0x3f;

         // Determine whether padding happened, and adjust accordingly
         paddingBytes = inx - (input.length - 1);
         switch(paddingBytes){
         case 2:
           // Set last 2 characters to padding char
           encodedCharIndexes[3] = 64;
           encodedCharIndexes[2] = 64;
           break;
         case 1:
           // Set last character to padding char
           encodedCharIndexes[3] = 25; //64;
           break;
         default:
           break; // No padding - proceed
         }
         // Now we will grab each appropriate character out of our keystring
         // based on our index array and append it to the output string
         for(jnx = 0; jnx < encodedCharIndexes.length; jnx++)
           output += this._keyStr.charAt(encodedCharIndexes[jnx]);
       }
       return output;
     }
   };

   var loader="data:image/gif;base64,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";
 })();
