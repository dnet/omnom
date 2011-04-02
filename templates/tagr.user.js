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
   var delicious=true;
   var fetching=0;
   var csrfmiddlewaretoken='';
   var loaded=false;
   var newsheets=[];
   var styles=[];
   var console=unsafeWindow.console;

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
     // prefetch session
     GM_xmlhttpRequest({ method: "head",
                         url: "{%root_url%}/"
                       });
     var odiv = document.createElement('div');
     odiv.id = 'tagr_div';
     odiv.style.display = 'none';

     var top=(WindowHeight()-380)/2;
     var left=(window.innerWidth-580)/2;
     odiv.style.cssText = 'border: 1px solid grey; background: white; position:fixed; z-index:999999; top:'+
       top+'px; left:'+left+'px; width: 580px; height: 380px; text-align: justify';

     var tagrframe = document.createElement('div');
     tagrframe.id = 'tagr_frame';
     buildForm(tagrframe);
     odiv.appendChild(tagrframe);

     var snapstat = document.createElement('div');
     snapstat.id = 'tagr_snapshotStatus';
     snapstat.style.cssText = 'border: 1px solid grey; position: absolute; bottom: 0px; width: 100%; height: 1.2em; padding 3px;';
     odiv.appendChild(snapstat);
     document.getElementsByTagName('body')[0].appendChild(odiv);
     toggleWidget(odiv);
   }

   function toggleWidget(tagr) {
     if(tagr.style.display != 'block') {
       fetching=0; loaded=false;
       window.parent.document.getElementById('id_url').value=window.parent.document.location.href;
       window.parent.document.getElementById('id_title').value=window.parent.document.title;
       window.parent.document.getElementById('id_notes').value=getSelected();
       // prefetch credentials
       GM_xmlhttpRequest({ method: "head",
                           url: "{%root_url%}/",
                           onload: function(e) {
                             GM_xmlhttpRequest({ method: "get",
                                                 url: '{%root_url%}/c/',
                                                 onload: function (e) {
                                                   csrfmiddlewaretoken=e.responseText;
                                                 }});
                           }});
       tagr.style.display = 'block';
       if(delicious) {
         GM_xmlhttpRequest({ method: "get",
                             url: 'https://api.del.icio.us/v1/posts/suggest?url='+encodeURIComponent(window.parent.document.location.href),
                             onload: updateSuggestedTags
                           });}
       window.addEventListener('submit', interceptor, true);
       doSnapshot();
     } else {
       tagr.style.display = 'none';
       buildForm(window.parent.document.getElementById('tagr_frame'));
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

   function cloneDoc() {
     store.contentDocument.innerHTML='';
     store.contentDocument.open();
     store.contentDocument.write(window.document.documentElement.innerHTML);
     store.contentDocument.close();
     // update content/charset
     var iterator = store.contentDocument.evaluate("//meta[@http-equiv='Content-Type' and contains(@content, 'charset')]", store.contentDocument, null, XPathResult.UNORDERED_NODE_ITERATOR_TYPE, null );
     try {
        var thisNode = iterator.iterateNext();
        while (thisNode) {
           thisNode.parentNode.removeChild(thisNode);
           thisNode = iterator.iterateNext();
        }
     } catch (e) {
        //alert(e);
     }
     var meta=store.contentDocument.createElement('meta');
     meta.setAttribute('http-equiv','content-type');
     meta.setAttribute('content','text/html; charset=utf-8');
     store.wrappedJSObject.contentDocument.getElementsByTagName("head")[0].appendChild(meta);

     meta=store.contentDocument.createElement('meta');
     meta.setAttribute('name','generator');
     meta.setAttribute('content','omnom userscript snapshooter');
     meta.setAttribute('timestamp',new Date().toISOString());
     meta.setAttribute('ua', window.navigator.userAgent);
     store.wrappedJSObject.contentDocument.getElementsByTagName("head")[0].appendChild(meta);
   }

   function delNode(id) {
     var tmp=store.contentDocument.getElementById(id);
     if (tmp) {
       tmp.parentNode.removeChild(tmp);
     }
   }

   function doSnapshot() {
     var status = window.parent.document.getElementById( "tagr_snapshotStatus" );
     status.innerHTML="Snapshotting...";
     cloneDoc();
     // convert images to dataurls
     // background attribs of elems
     dumpImages();
     dumpElementStyles();

     // TODO css: content/cursor
     // embed/object?

     // convert link rel=stylesheet to <style elements>
     inlineCSS();

     //dumpScripts();
     // nah rather nix them. safer.
     var elems = store.contentDocument.getElementsByTagName( "script" );
     while(elems.length) { elems[0].parentNode.removeChild(elems[0]); }

     // does this work? nah, unfortunately blank images served. :(
     //dumpCanvas();
   }

   function inlineCSS() {
     // delete copied over css
     //var elems = store.contentDocument.styleSheets;
     //while(elems.length) elems[0].ownerNode.parentNode.removeChild(elems[0].ownerNode);
     // parse and convert from original css
     var elems = window.document.styleSheets;
     var storelems = store.contentDocument.styleSheets;
     if(elems.length!=storelems.length) {
        alert("huh? bug bounty, send me the current url pls.\norig and store have differing stylesheet arrays "+elems.length+" "+storelems.length);
     }
     for(var i=0; i < elems.length; i++) {
        updateStatus(1);
        if((elems[i].ownerNode.getAttribute('rel') || '').toLowerCase()=='stylesheet') {
           // fetch <link rel='stylesheet' href='<url>'> and inline it
           //alert('fetch '+elems[i].ownerNode.href);
           var j=styles.length;
           styles.push(['',storelems[i].ownerNode]); // placeholder for async results
           fetchSheet(elems[i].ownerNode.href, elems[i].media.mediaText || 'all', null, j);
        } else {
          // handle <style> elements
          var style=CSSOM.parse(elems[i].ownerNode.innerHTML);
          style.media=elems[i].media.mediaText;
          style.base=window.document.baseURI;
          styles.push([style,storelems[i].ownerNode]);
          inlineSheet(style);
        }
       updateStatus(-1);
     }
   }

   function fetchSheet(url, media, parent, stylesidx) {
     //alert('fetch '+url);
     updateStatus(1);
     GM_xmlhttpRequest({ method: "get",
       url: url,
       overrideMimeType: 'text/plain; charset=x-user-defined',
       media: media,
       parent: parent,
       styles: styles,
       idx: stylesidx,
       onerror: function(e) { updateStatus(-1); },
       onload: function(e) {
         var style=null;
         try {
           style=CSSOM.parse(e.responseText);
         }
         catch(e) {
           alert('cssom parse error '+this.url+' '+e+'\nbug bounty, pls send me this url');
           style=null;
         }
         if(style) {
           style.type='stylesheet';
           style.media=this.media;
           style.base=this.url;
           if(!this.parent) {
              //alert(this.idx);
              if(this.idx>-1) {
                 //alert(this.styles+'\n'+this.idx+'\n'+this.styles[this.idx]);
                 this.styles[this.idx][0]=style;
              } else {
                 alert('dangling stylesheet '+this.url+'\nbug bounty, pls send me this url');
                 this.styles.push([style,null]);
              }
           } else {
             this.parent.styleSheet=style;
           };
           inlineSheet(style);
         }
         updateStatus(-1);
       }});
   }

   function inlineSheet(sheet) {
     //alert('inline '+sheet.cssRules.length+'\n'+sheet.base);
     var ruleName=null;
     if(!sheet.cssRules) { alert('no css rulez\n'+sheet+'\nbug bounty, pls send me this url'); return; }
     for(var i=0; i < sheet.cssRules.length; i++) {
       if(sheet.cssRules[i].href) {
         //alert('fetch\n'+sheet.cssRules[i].href);
         fetchSheet(toAbsURI(sheet.cssRules[i].href,sheet.base), sheet.media.mediaText || 'all', sheet.cssRules[i]);
         continue;
       }
       if(!sheet.cssRules[i].style) continue;
       // also handle list-style-image
       for(ruleName in {'background':null, 'background-image':null, 'list-style-image': null, 'list-style': null}) {
         if(!sheet.cssRules[i].style[ruleName]) continue;
         var bgImgRule=sheet.cssRules[i].style[ruleName].match(/(.*url\()['"]?(.*[^'")])['"]?(\).*)/i);
         if(!bgImgRule) continue;
         // inline background-image urls
         var url=bgImgRule[2];
         // skip already inlined images
         if(url.slice(0,5)=='data:') { continue; }
         updateStatus(1);
         url=toAbsURI(url,sheet.base);
         GM_xmlhttpRequest({ method: "get",
                             url: url,
                             overrideMimeType: 'text/plain; charset=x-user-defined',
                             item: sheet.cssRules[i].style,
                             ruleName: ruleName,
                             rule: bgImgRule,
                             onerror: function(e) { updateStatus(-1); },
                             onload: function(e) {
                               if(e.status!="200") {
                                 //alert("snapshot error: "+this.url);
                                 updateStatus(-1);
                                 return;
                               }
                               var re = new RegExp("^Content-Type:\\s+(.*?)\\s*$", "m");
                               var matched = e.responseHeaders.match(re);
                               if(matched[1].slice(0,6)=='image/') {
                                 var dataurl = 'data:'+((matched)? matched[1]: "")+";base64,"+Base64.encode(e.responseText);
                                 this.item[this.ruleName]=this.rule[1]+dataurl+this.rule[3];
                               }
                               updateStatus(-1);
                             }});
       }
     }
   }

   function dumpCSS(sheet) {
     var txt='';
     for(var i=0; i < sheet.cssRules.length; i++) {
       if(sheet.cssRules[i].styleSheet) {
         txt+='\n'+dumpCSS(sheet.cssRules[i].styleSheet);
       } else if(sheet.cssRules[i].cssText) {
         txt+='\n'+sheet.cssRules[i].cssText;
       }
     }
     return txt;
   }

   function dumpStyleImage(thisNode) {
     // todo iterate over this list, currently only one is processed, if there are more viable candidates for snapshotting they're ignored
     var rules=['background', 'background-image', 'list-style-image'];
     var ruleName=null;
     for(i in rules) {
        ruleName=rules[i];
        if(ruleName && ruleName in thisNode.style) {
           var bgImgRule=thisNode.style[ruleName].match(/(.*url\()['"]?(.*[^'"])['"]?(\).*)/i);
           if(!bgImgRule) return;
           // inline background-image urls
           var url=bgImgRule[2];
           // skip already inlined images
           if(url.slice(0,5)=='data:') { return; }
           updateStatus(1);
           url=toAbsURI(url);
           GM_xmlhttpRequest({ method: "get",
                               url: url,
                               overrideMimeType: 'text/plain; charset=x-user-defined',
                               item: thisNode.style,
                               ruleName: ruleName,
                               rule: bgImgRule,
                               onerror: function(e) { updateStatus(-1); },
                               onload: function(e) {
                                 if(e.status!="200") {
                                   //alert("snapshot error: "+this.url);
                                   updateStatus(-1);
                                   return;
                                 }
                                 var re = new RegExp("^Content-Type:\\s+(.*?)\\s*$", "m");
                                 var matched = e.responseHeaders.match(re);
                                 if(matched[1].slice(0,6)=='image/') {
                                   var dataurl = 'data:'+((matched)? matched[1]: "")+";base64,"+Base64.encode(e.responseText);
                                   this.item[this.ruleName]=this.rule[1]+dataurl+this.rule[3];
                                 }
                                 updateStatus(-1);
                               }});
        }
     }
   }

   function dumpElementStyles() {
     // furthermore handle <a style="background-image: url(http://.../i.png);" href="/" title="Visit the main page"></a>
     var iterator = store.contentDocument.evaluate("//*[contains(@style, 'url(')]", store.contentDocument, null, XPathResult.UNORDERED_NODE_ITERATOR_TYPE, null );

	  try {
	    var thisNode = iterator.iterateNext();
	    while (thisNode) {
         dumpStyleImage(thisNode);
	      thisNode = iterator.iterateNext();
       }
	  } catch (e) {
       //alert(e);
	  }
   }

   function dumpImages() {
     var elems = store.contentDocument.getElementsByTagName( "img" );
     for(var i=0; i < elems.length; i++) {
       var img=elems.item(i);
       if(!img.src || img.src.slice(0,5)=='data:') { continue; }
       fetchImage(img);
     }
     // also handle <input type='image'>
     elems = store.contentDocument.getElementsByTagName( "input" );
     for(i=0; i < elems.length; i++) {
       var img=elems.item(i);
       if(img.getAttribute('type') != 'image' || !img.src || img.src.slice(0,5)=='data:') { continue; }
       fetchImage(img);
     }
     // don't forget to handle favicons: <link rel="Shortcut Icon" href="/favicon.ico" />
     elems = store.contentDocument.getElementsByTagName( "link" );
     for(i=0; i < elems.length; i++) {
       var img=elems.item(i);
       if(img.getAttribute('rel').toLowerCase() != 'shortcut icon' || !img.href || img.href.slice(0,5)=='data:') { continue; }
       fetchImage(img,'href');
     }
   }

   function fetchImage(img, target) {
     updateStatus(1);
     GM_xmlhttpRequest({ method: "get",
                         url: img.src || img.href,
                         overrideMimeType: 'text/plain; charset=x-user-defined',
                         item: img,
                         target: target || 'src',
                         onerror: function(e) { updateStatus(-1); },
                         onload: function(e) {
                           if(e.status!="200") {
                             //alert("snapshot error: "+this.url);
                             updateStatus(-1);
                             return;
                           }
                           var re = new RegExp("^Content-Type:\\s+(.*?)\\s*$", "m");
                           var matched = e.responseHeaders.match(re);
                           var dataurl='data:'+((matched)? matched[1]: "")+";base64,"+Base64.encode(e.responseText);
                           this.item.setAttribute(this.target,dataurl);
                           updateStatus(-1);
                           //alert('dumping img '+this.item.getAttribute('src'));
                         }});
   }

   function updateStatus(code) {
     fetching+=code;
     var status = window.parent.document.getElementById( "tagr_snapshotStatus" );
     if(fetching) {
       status.innerHTML="Snapshotting... "+fetching+" objects";
     } else {
       status.innerHTML="Snapshot done.";
       // dump cssom styles to style elements
       exportCSS();
     }
   }

   function exportCSS() {
       for(var i=0; i < styles.length; i++) {
         var style = store.contentDocument.createElement("style");
         style.media=styles[i][0].media || 'all';
         //alert(styles[i].base+'\n'+styles[i]);
         style.innerHTML=dumpCSS(styles[i][0]);
         //store.wrappedJSObject.contentDocument.getElementsByTagName("head")[0].appendChild(style);
         styles[i][1].parentNode.replaceChild(style,styles[i][1]);
       }
   }

   function interceptor(e) {
     var frm = e.target;
     if (frm.id=='tagr_addForm') {
       e.stopPropagation();
       e.preventDefault();
       var csrf=csrfmiddlewaretoken;
       var url=encodeURIComponent(window.parent.document.getElementById('id_url').value);
       var title=encodeURIComponent(window.parent.document.getElementById('id_title').value);
       var notes=encodeURIComponent(window.parent.document.getElementById('id_notes').value);
       var tags=encodeURIComponent(window.parent.document.getElementById('id_tags').value);
       var priv=encodeURIComponent(window.parent.document.getElementById('id_private').value);
       // FIXME somehow doesn't delete tagr_store iframe
       delNode("tagr_store");
       delNode("tagr_div");
       delNode("tagr_styles");
       if(fetching) { // we don't wait for long timeouts.
          exportCSS();
       }
       var nsl="";
       for(var i=0, ns=window.document.documentElement.attributes; i<ns.length; i++) {
          nsl+=ns.item(i).nodeName+'="'+ns.item(i).nodeValue+'" ';
       }
       var doctype='';
       if(window.document.doctype) {
         doctype='<!DOCTYPE '+window.document.doctype.name+
                                       (window.document.doctype.publicId?
                                        ' PUBLIC "'+window.document.doctype.publicId+'"' :
                                        '')+
                                       (window.document.doctype.systemId?
                                        ' "'+ window.document.doctype.systemId+'"':
                                        '') +'">\n';
       }
       var snapshot=encodeURIComponent(doctype+"<html "+nsl+">\n"+store.contentDocument.documentElement.innerHTML+'\n</html>');

       // submit the form!
       GM_xmlhttpRequest({ method: 'POST',
	                        url: '{%root_url%}/add/?close=1',
                           data: 'csrfmiddlewaretoken='+csrf+'&url='+url+'&title='+title+'&notes='+notes+'&page='+snapshot,
                           headers: [{'Content-type': 'application/x-www-form-urlencoded'}],
                           onload: submitForm
                         });
       document.close();
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

   function gotFrame(iframe, win, doc) {
     iframe.style.display='none';
     iframe.id='tagr_store';
     store=iframe;
   }

   function toAbsURI(uri,base) {
     if(uri.match(/\w+:\/\//)) { return uri; }
     if(!base) base=window.document.baseURI;
     base = String(base).split("?")[0]; // strip away get params
     var scheme = base.slice(0,base.indexOf(':'));
     var tmp=base.slice(base.indexOf(':'),-1);
     tmp = tmp.split('/');
     var host=tmp[2], path=tmp.slice(3,-1).join('/');

     if(uri.slice(0,2)=='//')
       return scheme+'://'+uri;
     if(uri.slice(0,1)=='/')
       return scheme+'://'+host+uri;
     if(uri.slice(0,1)=='#')
       return base.split('#')[0]+uri;
     if(uri.slice(0,1)=='?')
       return base+uri;
     return scheme+'://'+host+'/'+path+'/'+uri;
   }

   function buildForm(tagrframe) {
     tagrframe.innerHTML=('<style id="tagr_styles"> \
                          #tagr_frame { border: 0; padding: 0;border-top:1px solid #E9E9E9; overflow:hidden; padding:12px 0 12px 10px; -moz-border-radius: 0.5em; -webkit-border-radius: 0.5em;} \
                          #tagr_div * { font-size: 12px; color: #666; font-family: Verdana,Arial,Helvetica,sans-serif; text-align: justify; } \
                          #tagr_frame [rel=tag] { background-color: #ddd; margin-left: 5px; margin-bottom: 2px; padding: 1px; 1px 1px 1px; } \
                          #tagr_frame [rel=tag]:hover { text-decoration: none; color: #fff; } \
                          #tagr_frame input, #tagr_frame textarea { border: 1px solid #0088DD; background: #FFFFFF; color: #666666; } \
                          #tagr_frame .button { border: 1px solid #0088DD; background: #FFFFFF; color: #666666; padding: 0px 6px 0px 6px; margin: 4px; text-decoration: none; color: #666666;} \
                          #tagr_frame fieldset { font-size: 0.8em; margin-bottom: 0.7em; border: 1px solid #0088DD; -moz-border-radius: 0.5em; -webkit-border-radius: 0.5em;} \
                          #tagr_frame a { text-decoration: none; color: #0088dd; } \
                          #tagr_frame a[href]:hover { text-decoration: none; color: #000; } \
                          #tagr_frame input[type=text], #tagr_div textarea { width: 420px; } \
                          #tagr_frame .suggestedTag { cursor: pointer ; color: #0088dd; } \
                          #tagr_frame .xfolkentry {} \
                          #tagr_frame .xfolkentry [rel=tag] {float: right; } \
                          #tagr_frame ul.tags { margin: 0px; padding:5px 0 5px 65px;} \
                          #tagr_frame .tags li { display: inline; list-style: none; }  \
                          </style> \
                          <form method="get" action="{%root_url%}/add/" id="tagr_addForm" name="addForm" class="xfolkentry"> \
                          <table><tbody> \
                          <tr><td><label for="id_url">UR Location</label></td><td><input type="text" id="id_url" name="url"></td></tr> \
                          <tr><td><label for="id_title">Title</label></td><td><input type="text" id="id_title" name="title"></td></tr> \
                          <tr><td><label for="id_notes">Notes</label></td><td><textarea name="notes" cols="40" rows="10" id="id_notes"></textarea></td></tr> \
                          <tr><td><label for="id_tags">Tags</label></td><td><input type="text" id="id_tags" name="tags"></td></tr> \
                          <tr><td>Recommended&nbsp;Tags</td><td width="100%" id="tagr_tagsuggestion">None</td></tr> \
                          <tr><td><label for="id_private">Private</label></td><td><input type="checkbox" id="id_private" name="private"></td></tr> \
                          <tr><td></td><td><input type="submit" value="save"><input type="button" value="cancel"></td></tr> \
                          </tbody></table> \
                          <input type="hidden" id="id_page" name="page"> \
                          </form>');
   }

//   function dumpCanvas() {
//     var elems = store.contentDocument.wrappedJSObject.getElementsByTagName("canvas");
//     while (elems.length) {
//       var canvas=elems.item(0);
//       //alert('dumping canvas'+canvas.getAttribute('id'));
//       var image = new Image();
//       //alert('data:'+canvas.toDataURL("image/png").slice(5);
//       image.src='data:'+canvas.toDataURL("image/png").slice(5);
//       image.setAttribute('class',canvas.getAttribute('class') || "");
//       image.setAttribute('style',canvas.getAttribute('style') || "");
//       image.setAttribute('id',canvas.getAttribute('id') || "");
//       image.setAttribute('width',canvas.getAttribute('width') || "");
//       image.setAttribute('height',canvas.getAttribute('height') || "");
//       canvas.parentNode.replaceChild(image,canvas);
//       //alert(elems.length);
//     }
//   }

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
           unsafeWindow.console.log(message);
         done();
       }
       catch(e) {
         if (unsafeWindow.console && unsafeWindow.console.error && unsafeWindow.console.trace) {
           unsafeWindow.console.error( e );
           unsafeWindow.console.trace();
         }
         if (debug)
           unsafeWindow.console.log(message + "and our iframe was invaded. Trying again!");
         document.body.removeChild(iframe);
         makeFrame(cb, name);
       }
     }

     function done() {
       clearTimeout(load.timeout);
       iframe.removeEventListener("load", done, true);
       if (debug)
         unsafeWindow.console.log("IFrame %x load event after %d ms",
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
                         "z-index:999999; border:0; margin:0; padding:0; " +
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

   function WindowHeight() {
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

	  // public method for encoding
	  encode : function (input) {
		 var output = "";
		 var chr1, chr2, chr3, enc1, enc2, enc3, enc4;
		 var i = 0;

		 while (i < input.length) {

			chr1 = input.charCodeAt(i++);
			chr2 = input.charCodeAt(i++);
			chr3 = input.charCodeAt(i++);

			enc1 = (chr1 & 0xff)  >> 2;
			enc2 = ((chr1 & 3) << 4) | ((chr2 & 0xff) >> 4);
         enc3 = ((chr2 & 15) << 2) | ((chr3 & 0xff) >> 6);
         enc4 = chr3 & 63;

         if (isNaN(chr2)) {
           enc3 = enc4 = 64;
         } else if (isNaN(chr3)) {
           enc4 = 64;
         }

			output = output +
			  this._keyStr.charAt(enc1) + this._keyStr.charAt(enc2) +
			  this._keyStr.charAt(enc3) + this._keyStr.charAt(enc4);
		 }
		 return output;
     }
   };

// src: https://github.com/NV/CSSOM
var CSSOM = {};
/**
 * @constructor
 * @see http://www.w3.org/TR/DOM-Level-2-Style/css.html#CSS-CSSStyleDeclaration
 */
CSSOM.CSSStyleDeclaration = function CSSStyleDeclaration(){
	this.length = 0;
	// NON-STANDARD
	this._importants = {};
};
CSSOM.CSSStyleDeclaration.prototype = {
	constructor: CSSOM.CSSStyleDeclaration,
	/**
	 *
	 * @param {string} name
	 * @see http://www.w3.org/TR/DOM-Level-2-Style/css.html#CSS-CSSStyleDeclaration-getPropertyValue
	 * @return {string} the value of the property if it has been explicitly set for this declaration block.
	 * Returns the empty string if the property has not been set.
	 */
	getPropertyValue: function(name) {
		return this[name] || "";
	},
	/**
	 *
	 * @param {string} name
	 * @param {string} value
	 * @param {string} [priority=null] "important" or null
	 * @see http://www.w3.org/TR/DOM-Level-2-Style/css.html#CSS-CSSStyleDeclaration-setProperty
	 */
	setProperty: function(name, value, priority) {
		if (this[name]) {
			// Property already exist. Append it only it.
		   this[this.length] = [name, value, priority];
		   this.length++;
		} else {
			// New property.
			this[this.length] = name;
			this.length++;
		   this[name] = value;
         this._importants[name] = priority;
		}
	},
	/**
	 *
	 * @param {string} name
	 * @see http://www.w3.org/TR/DOM-Level-2-Style/css.html#CSS-CSSStyleDeclaration-removeProperty
	 * @return {string} the value of the property if it has been explicitly set for this declaration block.
	 * Returns the empty string if the property has not been set or the property name does not correspond to a known CSS property.
	 */
	removeProperty: function(name) {
		if (!(name in this)) {
			return "";
		}
		var index = Array.prototype.indexOf.call(this, name);
		if (index < 0) {
			return "";
		}
		var prevValue = this[name];
		this[name] = "";
		// That's what WebKit and Opera do
		Array.prototype.splice.call(this, index, 1);
		// That's what Firefox does
		//this[index] = ""
		return prevValue;
	},
	getPropertyCSSValue: function() {
		//FIXME
	},
	/**
	 *
	 * @param {String} name
	 */
	getPropertyPriority: function(name) {
		return this._importants[name] || "";
	},
	/**
	 *   element.style.overflow = "auto"
	 *   element.style.getPropertyShorthand("overflow-x")
	 *   -> "overflow"
	 */
	getPropertyShorthand: function() {
		//FIXME
	},
	isPropertyImplicit: function() {
		//FIXME
	},
	// Doesn't work in IE < 9
	get cssText(){
		var properties = [];
		for (var i=0, length=this.length; i < length; ++i) {
         var name, value, priority;
         if (this[i] instanceof Array) {
			  name = this[i][0];
			  value = this[i][1];
			  priority = this[i][2];
			  if (priority) {
				 priority = " !" + priority;
           }
         } else {
			  name = this[i];
			  value = this.getPropertyValue(name);
			  priority = this.getPropertyPriority(name);
			  if (priority) {
				 priority = " !" + priority;
			  }
         }
			properties[i] = name + ": " + value + priority + ";";
		}
		return properties.join(" ");
	}
};
/**
 * @constructor
 * @see http://dev.w3.org/csswg/cssom/#the-cssrule-interface
 * @see http://www.w3.org/TR/DOM-Level-2-Style/css.html#CSS-CSSRule
 */
CSSOM.CSSRule = function CSSRule() {
	this.parentRule = null;
};
CSSOM.CSSRule.STYLE_RULE = 1;
CSSOM.CSSRule.IMPORT_RULE = 3;
CSSOM.CSSRule.MEDIA_RULE = 4;
CSSOM.CSSRule.FONT_FACE_RULE = 5;
CSSOM.CSSRule.PAGE_RULE = 6;
CSSOM.CSSRule.WEBKIT_KEYFRAMES_RULE = 8;
CSSOM.CSSRule.WEBKIT_KEYFRAME_RULE = 9;
// Obsolete in CSSOM http://dev.w3.org/csswg/cssom/
//CSSOM.CSSRule.UNKNOWN_RULE = 0;
//CSSOM.CSSRule.CHARSET_RULE = 2;
// Never implemented
//CSSOM.CSSRule.VARIABLES_RULE = 7;
CSSOM.CSSRule.prototype = {
	constructor: CSSOM.CSSRule
	//FIXME
};
/**
 * @constructor
 * @see http://dev.w3.org/csswg/cssom/#cssstylerule
 * @see http://www.w3.org/TR/DOM-Level-2-Style/css.html#CSS-CSSStyleRule
 */
CSSOM.CSSStyleRule = function CSSStyleRule() {
	this.selectorText = "";
	this.style = new CSSOM.CSSStyleDeclaration;
};
CSSOM.CSSStyleRule.prototype = new CSSOM.CSSRule;
CSSOM.CSSStyleRule.prototype.constructor = CSSOM.CSSStyleRule;
CSSOM.CSSStyleRule.prototype.type = 1;
CSSOM.CSSStyleRule.prototype.__defineGetter__("cssText", function() {
	var text;
	if (this.selectorText) {
		text = this.selectorText + " {" + this.style.cssText + "}";
	} else {
		text = "";
	}
	return text;
});
CSSOM.CSSStyleRule.prototype.__defineSetter__("cssText", function(cssText) {
	var rule = CSSOM.CSSStyleRule.parse(cssText);
	this.style = rule.style;
	this.selectorText = rule.selectorText;
});
/**
 * NON-STANDARD
 * lightweight version of parse.js.
 * @param {string} ruleText
 * @return CSSStyleRule
 */
CSSOM.CSSStyleRule.parse = function(ruleText) {
	var i = 0;
	var state = "selector";
	var index;
	var j = i;
	var buffer = "";
	var SIGNIFICANT_WHITESPACE = {
		"selector": true,
		"value": true
	};
	var styleRule = new CSSOM.CSSStyleRule;
	var selector, name, value, priority="";
	for (var character; character = ruleText.charAt(i); i++) {
		switch (character) {
		case " ":
		case "\t":
		case "\r":
		case "\n":
		case "\f":
			if (SIGNIFICANT_WHITESPACE[state]) {
				// Squash 2 or more white-spaces in the row into 1
				switch (ruleText.charAt(i - 1)) {
					case " ":
					case "\t":
					case "\r":
					case "\n":
					case "\f":
						break;
					default:
						buffer += " ";
						break;
				}
			}
			break;
		// String
		case '"':
			j = i + 1;
			index = ruleText.indexOf('"', j) + 1;
			if (!index) {
				throw '" is missing';
			}
			buffer += ruleText.slice(i, index);
			i = index - 1;
			break;
		case "'":
			j = i + 1;
			index = ruleText.indexOf("'", j) + 1;
			if (!index) {
				throw "' is missing";
			}
			buffer += ruleText.slice(i, index);
			i = index - 1;
			break;
		// Comment
		case "/":
			if (ruleText.charAt(i + 1) == "*") {
				i += 2;
				index = ruleText.indexOf("*/", i);
				if (index == -1) {
					throw SyntaxError("Missing */");
				} else {
					i = index + 1;
				}
			} else {
				buffer += character;
			}
			break;
		case "{":
			if (state == "selector") {
				styleRule.selectorText = buffer.trim();
				buffer = "";
				state = "name";
			}
			break;
		case ":":
			if (state == "name") {
				name = buffer.trim();
				buffer = "";
				state = "value";
			} else {
				buffer += character;
			}
			break;
		case "!":
			if (state == "value" && ruleText.indexOf("!important", i) === i) {
				priority = "important";
				i += "important".length;
			} else {
				buffer += character;
			}
			break;
		case ";":
			if (state == "value") {
				styleRule.style.setProperty(name, buffer.trim(), priority);
				priority = "";
				buffer = "";
				state = "name";
			} else {
				buffer += character;
			}
			break;
		case "}":
			if (state == "value") {
				styleRule.style.setProperty(name, buffer.trim(), priority);
				priority = "";
				buffer = "";
			} else if (state == "name") {
				break;
			} else {
				buffer += character;
			}
			state = "selector";
			break;
		default:
			buffer += character;
			break;
		}
	}
	return styleRule;
};
/**
 * @constructor
 * @see http://dev.w3.org/csswg/cssom/#cssimportrule
 * @see http://www.w3.org/TR/DOM-Level-2-Style/css.html#CSS-CSSImportRule
 */
CSSOM.CSSImportRule = function CSSImportRule() {
	this.href = "";
	this.media = new CSSOM.MediaList;
	this.styleSheet = new CSSOM.CSSStyleSheet;
};
CSSOM.CSSImportRule.prototype = new CSSOM.CSSRule;
CSSOM.CSSImportRule.prototype.constructor = CSSOM.CSSImportRule;
CSSOM.CSSImportRule.prototype.type = 3;
CSSOM.CSSImportRule.prototype.__defineGetter__("cssText", function() {
	return "@import url("+ this.href +") "+ this.media.mediaText +";";
});
CSSOM.CSSImportRule.prototype.__defineSetter__("cssText", function(cssText) {
	var i = 0;
	/**
	 * @import url(partial.css) screen, handheld;
	 *        ||               |
	 *        after-import     media
	 *         |
	 *         url
	 */
	var state = '';
	var buffer = '';
	var index;
	var mediaText = '';
	for (var character; character = cssText.charAt(i); i++) {
		switch (character) {
			case ' ':
			case '\t':
			case '\r':
			case '\n':
			case '\f':
				if (state == 'after-import') {
					state = 'url';
				} else {
					buffer += character;
				}
				break;
			case '@':
				if (!state && cssText.indexOf('@import', i) == i) {
					state = 'after-import';
					i += 'import'.length;
					buffer = '';
				}
				break;
			case 'u':
				if (state == 'url' && cssText.indexOf('url(', i) == i) {
					index = cssText.indexOf(')', i + 1);
					if (index == -1) {
						throw i + ': ")" not found';
					}
					i += 'url('.length;
					var url = cssText.slice(i, index);
					if (url[0] === url[url.length - 1]) {
						if (url[0] == '"' || url[0] == "'") {
							url = url.slice(1, -1);
						}
					}
					this.href = url;
					i = index;
					state = 'media';
				}
				break;
			case '"':
				if (state == 'url') {
					index = cssText.indexOf('"', i + 1);
					if (!index) {
						throw i + ": '\"' not found";
					}
					this.href = cssText.slice(i + 1, index);
					i = index;
					state = 'media';
				}
				break;
			case "'":
				if (state == 'url') {
					index = cssText.indexOf("'", i + 1);
					if (!index) {
						throw i + ': "\'" not found';
					}
					this.href = cssText.slice(i + 1, index);
					i = index;
					state = 'media';
				}
				break;
			case ';':
				if (state == 'media') {
					if (buffer) {
						this.media.mediaText = buffer.trim();
					}
				}
				break;
			default:
				if (state == 'media') {
					buffer += character;
				}
				break;
		}
	}
});
/**
 * @constructor
 * @see http://dev.w3.org/csswg/cssom/#the-medialist-interface
 */
CSSOM.MediaList = function MediaList(){
	this.length = 0;
};
CSSOM.MediaList.prototype = {
	constructor: CSSOM.MediaList,
	/**
	 * @return {string}
	 */
	get mediaText() {
		return Array.prototype.join.call(this, ", ");
	},
	/**
	 * @param {string} value
	 */
	set mediaText(value) {
		var values = value.split(",");
		var length = this.length = values.length;
		for (var i=0; i<length; i++) {
			this[i] = values[i].trim();
		}
	},
	/**
	 * @param {string} medium
	 */
	appendMedium: function(medium) {
		if (Array.prototype.indexOf.call(this, medium) == -1) {
			this[this.length] = medium;
			this.length++;
		}
	},
	/**
	 * @param {string} medium
	 */
	deleteMedium: function(medium) {
		var index = Array.prototype.indexOf.call(this, medium);
		if (index != -1) {
			Array.prototype.splice.call(this, index, 1);
		}
	}

};
/**
 * @constructor
 * @see http://dev.w3.org/csswg/cssom/#cssmediarule
 * @see http://www.w3.org/TR/DOM-Level-2-Style/css.html#CSS-CSSMediaRule
 */
CSSOM.CSSMediaRule = function CSSMediaRule() {
	this.media = new CSSOM.MediaList;
	this.cssRules = [];
};
CSSOM.CSSMediaRule.prototype = new CSSOM.CSSRule;
CSSOM.CSSMediaRule.prototype.constructor = CSSOM.CSSMediaRule;
CSSOM.CSSMediaRule.prototype.type = 4;
//FIXME
//CSSOM.CSSMediaRule.prototype.insertRule = CSSStyleSheet.prototype.insertRule;
//CSSOM.CSSMediaRule.prototype.deleteRule = CSSStyleSheet.prototype.deleteRule;
// http://opensource.apple.com/source/WebCore/WebCore-658.28/css/CSSMediaRule.cpp
CSSOM.CSSMediaRule.prototype.__defineGetter__("cssText", function() {
	var cssTexts = [];
	for (var i=0, length=this.cssRules.length; i < length; i++) {
		cssTexts.push(this.cssRules[i].cssText);
	}
	return "@media " + this.media.mediaText + " {" + cssTexts.join("") + "}";
});
/**
 * @constructor
 * @see http://dev.w3.org/csswg/cssom/#the-stylesheet-interface
 */
CSSOM.StyleSheet = function StyleSheet(){};
/**
 * @constructor
 * @see http://www.w3.org/TR/DOM-Level-2-Style/css.html#CSS-CSSStyleSheet
 */
CSSOM.CSSStyleSheet = function CSSStyleSheet() {
	this.cssRules = [];
};
CSSOM.CSSStyleSheet.prototype = new CSSOM.StyleSheet;
CSSOM.CSSStyleSheet.prototype.constructor = CSSOM.CSSStyleSheet;
/**
 * Used to insert a new rule into the style sheet. The new rule now becomes part of the cascade.
 *
 *   sheet = new Sheet("body {margin: 0}")
 *   sheet.toString()
 *   -> "body{margin:0;}"
 *   sheet.insertRule("img {border: none}", 0)
 *   -> 0
 *   sheet.toString()
 *   -> "img{border:none;}body{margin:0;}"
 *
 * @param {string} rule
 * @param {number} index
 * @see http://www.w3.org/TR/DOM-Level-2-Style/css.html#CSS-CSSStyleSheet-insertRule
 * @return {number} The index within the style sheet's rule collection of the newly inserted rule.
 */
CSSOM.CSSStyleSheet.prototype.insertRule = function(rule, index) {
	if (index < 0 || index > this.cssRules.length) {
		throw new RangeError("INDEX_SIZE_ERR");
	}
	this.cssRules.splice(index, 0, CSSOM.CSSStyleRule.parse(rule));
	return index;
};
/**
 * Used to delete a rule from the style sheet.
 *
 *   sheet = new Sheet("img{border:none} body{margin:0}")
 *   sheet.toString()
 *   -> "img{border:none;}body{margin:0;}"
 *   sheet.deleteRule(0)
 *   sheet.toString()
 *   -> "body{margin:0;}"
 *
 * @param {number} index
 * @see http://www.w3.org/TR/DOM-Level-2-Style/css.html#CSS-CSSStyleSheet-deleteRule
 * @return {number} The index within the style sheet's rule list of the rule to remove.
 */
CSSOM.CSSStyleSheet.prototype.deleteRule = function(index) {
	if (index < 0 || index >= this.cssRules.length) {
		throw new RangeError("INDEX_SIZE_ERR");
	}
	this.cssRules.splice(index, 1);
};
/**
 * NON-STANDARD
 * @return {string} serialize stylesheet
 */
CSSOM.CSSStyleSheet.prototype.toString = function() {
	var result = "";
	var rules = this.cssRules;
	for (var i=0; i<rules.length; i++) {
		result += rules[i].cssText + "\n";
	}
	return result;
};
/**
 * @param {string} token
 * @param {Object} [options]
 */
CSSOM.parse = function parse(token, options) {
	options = options || {};
	var i = options.startIndex || 0;
	/**
	  "before-selector" or
	  "selector" or
	  "atRule" or
	  "atBlock" or
	  "before-name" or
	  "name" or
	  "before-value" or
	  "value"
	*/
	var state = options.state || "before-selector";
	var index;
	var j = i;
	var buffer = "";
	var SIGNIFICANT_WHITESPACE = {
		"selector": true,
		"value": true,
		"atRule": true,
		"importRule-begin": true,
		"importRule": true,
		"atBlock": true
	};
	var styleSheet = new CSSOM.CSSStyleSheet;
	// @type CSSStyleSheet|CSSMediaRule
	var currentScope = styleSheet;

	var selector, name, value, priority="", styleRule, mediaRule, importRule, ignore=0;
	for (var character; character = token.charAt(i); i++) {
		switch (character) {
		case " ":
		case "\t":
		case "\r":
		case "\n":
		case "\f":
			if (SIGNIFICANT_WHITESPACE[state]) {
				buffer += character;
			}
			break;
		// String
		case '"':
			j = i + 1;
         index = token.indexOf('"', j) + 1;
         while(true) {
			   if (!index) {
			   	throw '" is missing';
			   }
            if (token.charAt(index-2) != '\\') {
               break;
            }
            index = token.indexOf('"', index) + 1;
         }
			buffer += token.slice(i, index);
			i = index - 1;
			switch (state) {
				case 'before-value':
					state = 'value';
					break;
				case 'importRule-begin':
					state = 'importRule';
					break;
			}
			break;
		case "'":
			j = i + 1;
			index = token.indexOf("'", j) + 1;
         while(true) {
			   if (!index) {
			   	throw "' is missing";
			   }
            if (token.charAt(index-2) != '\\') {
               break;
            }
            index = token.indexOf("'", index) + 1;
         }
			buffer += token.slice(i, index);
			i = index - 1;
			switch (state) {
				case 'before-value':
					state = 'value';
					break;
				case 'importRule-begin':
					state = 'importRule';
					break;
			}
			break;
		// Comment
		case "/":
			if (token.charAt(i + 1) == "*") {
				i += 2;
				index = token.indexOf("*/", i);
				if (index == -1) {
					throw SyntaxError("Missing */");
				} else {
					i = index + 1;
				}
			} else {
				buffer += character;
			}
			if (state == "importRule-begin") {
				buffer += " ";
				state = "importRule";
			}
			break;
		// At-rule
		case "@":
			if (token.indexOf("@media", i) == i) {
				state = "atBlock";
				mediaRule = new CSSOM.CSSMediaRule;
				mediaRule.__starts = i;
				i += "media".length;
				buffer = "";
				break;
			} else if (token.indexOf("@import", i) == i) {
				state = "importRule-begin";
				i += "import".length;
				buffer += "@import";
				break;
			} else if (state == "selector") {
				state = "atRule";
			}
			buffer += character;
			break;
		case "{":
			if (state == "selector" || state == "atRule") {
				styleRule.selectorText = buffer.trimRight();
				styleRule.style.__starts = i;
				buffer = "";
				state = "before-name";
			} else if (state == "atBlock") {
				mediaRule.media.mediaText = buffer.trim();
				currentScope = mediaRule;
				buffer = "";
				state = "before-selector";
			}
			break;
		case ":":
			if (state == "name") {
				name = buffer.trim();
				buffer = "";
				state = "before-value";
			} else {
				buffer += character;
			}
			break;
		case '(':
			if (state == 'value') {
				index = token.indexOf(')', i + 1);
				if (index == -1) {
					throw i + ': unclosed "("';
				}
				buffer += token.slice(i, index + 1);
				i = index;
			} else {
				buffer += character;
			}
			break;
		case "!":
			if (state == "value" && token.indexOf("!important", i) === i) {
				priority = "important";
				i += "important".length;
			} else {
				buffer += character;
			}
			break;
		case ";":
			switch (state) {
				case "value":
					if(!ignore) styleRule.style.setProperty(name, buffer.trim(), priority);
					priority = "";
					buffer = "";
					state = "before-name";
					break;
				case "atRule":
					buffer = "";
					state = "before-selector";
					break;
				case "importRule":
					importRule = new CSSOM.CSSImportRule;
					importRule.cssText = buffer + character;
					currentScope.cssRules.push(importRule);
					buffer = "";
					state = "before-selector";
					break;
				default:
					buffer += character;
					break;
			}
			break;
		case "}":
			switch (state) {
				case "value":
					if(!ignore) styleRule.style.setProperty(name, buffer.trim(), priority);
					priority = "";
				case "before-name":
				case "name":
					styleRule.__ends = i + 1;
					currentScope.cssRules.push(styleRule);
					buffer = "";
					break;
				case "before-selector":
				case "selector":
					// End of media rule.
					// Nesting rules aren't supported yet
					if (!mediaRule) {
                  break;
						throw "unexpected } at "+i;
					}
					mediaRule.__ends = i + 1;
					styleSheet.cssRules.push(mediaRule);
					currentScope = styleSheet;
					buffer = "";
					break;
			}
			state = "before-selector";
			break;
		default:
         if(token.charCodeAt(i)>127) {
            // ignore non-ascii chars
            break;
         }
			switch (state) {
				case "before-selector":
					state = "selector";
					styleRule = new CSSOM.CSSStyleRule;
					styleRule.__starts = i;
					break;
				case "before-name":
		         if (character=='[' && !ignore) {
                 ignore=1;
                 break;};
		         if (character==']' && ignore) {
                 ignore=0;
                 break;};
					state = "name";
					break;
				case "before-value":
					state = "value";
					break;
				case "importRule-begin":
					state = "importRule";
					break;
			}
			buffer += character;
			break;
		}
	}
	return styleSheet;
};
/**
 * Produces a deep copy of stylesheet — the instance variables of stylesheet are copied recursively.
 * @param {CSSStyleSheet|CSSOM.CSSStyleSheet} stylesheet
 * @nosideeffects
 * @return {CSSOM.CSSStyleSheet}
 */
CSSOM.clone = function clone(stylesheet) {
	var cloned = new CSSOM.CSSStyleSheet;
	var rules = stylesheet.cssRules;
	if (!rules) {
		return cloned;
	}
	var RULE_TYPES = {
		1: CSSOM.CSSStyleRule,
		4: CSSOM.CSSMediaRule
		//FIXME
		//3: CSSOM.CSSImportRule,
		//5: CSSOM.CSSFontFaceRule,
		//6: CSSOM.CSSPageRule,
	};
	for (var i=0, rulesLength=rules.length; i < rulesLength; i++) {
		var rule = rules[i];
		var ruleClone = cloned.cssRules[i] = new RULE_TYPES[rule.type];
		var style = rule.style;
		if (style) {
			var styleClone = ruleClone.style = new CSSOM.CSSStyleDeclaration;
			for (var j=0, styleLength=style.length; j < styleLength; j++) {
				var name = styleClone[j] = style[j];
				styleClone[name] = style[name];
				styleClone._importants[name] = style.getPropertyPriority(name);
			}
			styleClone.length = style.length;
		}
		if ("selectorText" in rule) {
			ruleClone.selectorText = rule.selectorText;
		}
		if ("mediaText" in rule) {
			ruleClone.mediaText = rule.mediaText;
		}
		if ("cssRules" in rule) {
			rule.cssRules = clone(rule).cssRules;
		}
	}
	return cloned;
};
})();
