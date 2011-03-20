from models import Bookmark
from django.http import HttpResponse, HttpResponseRedirect, Http404
from django.shortcuts import render_to_response
from django.core.paginator import Paginator, InvalidPage, EmptyPage
from django.core.exceptions import ObjectDoesNotExist
from django.core.context_processors import csrf
from django.contrib.auth import authenticate, login
from django.contrib.auth.models import User
from django.template import RequestContext
from django.views.decorators.gzip import gzip_page
from django.conf import settings
import conf
from utils import unescape
from tags.forms import AddBookmarkForm, ImportDeliciousForm
from lxml import etree
from BeautifulSoup import BeautifulSoup, Comment
from datetime import datetime
from urlparse import urljoin, urlparse, urlunparse
from counter import getNextVal
from baseconv import base62
import urllib2, re, urllib, json, pymongo, hashlib, gzip

from django_mongokit import get_database
database = get_database()
collection = database['bookmarks']

#TODO split bookmarking and url tagging

def sanitizeHtml(value, base_url=None):
    rjs = r'[\s]*(&#x.{1,7})?'.join(list('javascript:'))
    rvb = r'[\s]*(&#x.{1,7})?'.join(list('vbscript:'))
    re_scripts = re.compile('(%s)|(%s)' % (rjs, rvb), re.IGNORECASE)
    validTags = 'p i strong b u a h1 h2 h3 pre br img'.split()
    validAttrs = 'href src width height'.split()
    urlAttrs = 'href src'.split() # Attributes which should have a URL
    soup = BeautifulSoup(value)
    for comment in soup.findAll(text=lambda text: isinstance(text, Comment)):
        # Get rid of comments
        comment.extract()
    for tag in soup.findAll(True):
        if tag.name not in validTags:
            tag.hidden = True
        attrs = tag.attrs
        tag.attrs = []
        for attr, val in attrs:
            if attr in validAttrs:
                val = re_scripts.sub('', val) # Remove scripts (vbs & js)
                if attr in urlAttrs:
                    val = urljoin(base_url, val) # Calculate the absolute url
                tag.attrs.append((attr, val))

    return soup.renderContents().decode('utf8')

def show(request,tags=[],user=None):
    if user:
        try: user = User.objects.get(username=user)
        except ObjectDoesNotExist: return HttpResponse("no access")

    try: limit=int(request.GET.get('limit'))
    except TypeError, ValueError: limit=25

    try: page=int(request.GET.get('page'))
    except TypeError, ValueError: page=1

    baseurl=request.path.split('?')[0]
    plist=baseurl.split('/')
    if plist[1]=='t':
        path='/'
    else:
        path='/'.join(plist[:-1])

    db = get_database()[Bookmark.collection_name]
    query={}
    if user and request.user!=user:
        query['private']=False
    if user:
        query['user']=unicode(user)
    if tags:
        tags=urllib.unquote_plus(tags).split(' ')
        query['tags']={'$all': tags}

    order=[('created', pymongo.DESCENDING)]
    res=db.find(query)

    tagcloud=[]
    if (tags or user) and request.GET.get('format','') == '':
        timetags={}
        for item in res:
            d=item['created'].strftime("%Y-%m-%d")
            timetags[d]=timetags.get(d,{})
            for t in item['tags']:
                if t in tags: continue
                timetags[d][t]=timetags[d].get(t,0)+1
        tagcloud=[(k.replace('&','&amp;'), sorted(v.items())) for k, v in sorted(timetags.items())]

    res=db.find(query,sort=order)
    total=res.count()
    paginator = Paginator(res, limit)
    try:
        res = paginator.page(page)
    except (EmptyPage, InvalidPage):
        res = paginator.page(paginator.num_pages)

    if request.GET.get('format','') == 'json':
        res=[{'url': unicode(obj['url']),
              'title': unicode(obj['title']),
              'created': tuple(obj['created'].timetuple()),
              'private': obj['private'],
              'notes': unicode(unescape(obj['notes'])),
              'tags': obj['tags']
              } for obj in res.object_list]
        return HttpResponse(json.dumps(res),mimetype="application/json")

    if request.GET.get('format','') == 'atom':
        tpl='atom.xml'
    else:
        tpl='list.html'

    res.object_list=[{'url': obj['url'],
                      'user': obj['user'],
                      'title': obj['title'],
                      'created': obj['created'],
                      'private': obj['private'],
                      'snapshot': obj.get('snapshot'),
                      'notes': unescape(obj['notes']),
                      'tags': [unicode(x) for x in obj['tags']]
                      } for obj in res.object_list]
    return render_to_response(tpl,
                              { 'items': res,
                                'limit': limit,
                                'total': total,
                                'tags': [(tag, "+".join([t for t in tags if not t == tag])if len(tags)>1 else path) for tag in tags] if tags else [],
                                'tagcloud': json.dumps(tagcloud),
                                'baseurl': baseurl,
                                'path': request.path},
                              context_instance=RequestContext(request) )

apacheFix=re.compile(r'(https?://?)\w*')
def fixApacheMadness(url):
    m=re.match(apacheFix,url)
    if m and m.group(1)[-2:] != '//':
        url="%s/%s" % (m.group(1),url[len(m.group(1)):])
    return url

utmRe=re.compile('utm_(source|medium|campaign|content)=')
def urlSanitize(url):
    # removes annoying UTM params to urls.
    pcs=urlparse(urllib.unquote_plus(url))
    tmp=list(pcs)
    tmp[4]='&'.join([x for x in pcs.query.split('&') if not utmRe.match(x)])
    return urlunparse(tmp)

def add(request,url=None):
    done=False
    if request.method == 'GET':
        form = AddBookmarkForm(request.GET)
    elif request.method == 'POST':
        form = AddBookmarkForm(request.POST)
        if request.GET.get('close'):
            done=True
    else:
        return HttpResponse("wrong method")
    try: user=User.objects.get(username=request.user)
    except ObjectDoesNotExist:
        return HttpResponseRedirect("/accounts/login")
    suggestedTags=set()
    db = get_database()[Bookmark.collection_name]
    if request.REQUEST.get("dontsave", 0) or not form.is_valid() or form.cleaned_data['popup']:
        if url: # try to edit an existing bookmark?
            url=fixApacheMadness(url)
            url=urlSanitize(url)
            try:
                obj=db.find_one({'url':url, 'user': unicode(user)})
            except ObjectDoesNotExist: obj=None
            if obj: # yes, edit an existing bookmark
                data={ 'url' : url,
                       'title' : obj['title'],
                       'tags' : ' '.join([unicode(x) for x in obj['tags']]),
                       'notes' : obj['notes'],
                       'private' : obj['private'],
                       'popup' : form.cleaned_data['popup'] }
                try:
                    suggestedTags=set(suggestTags(data['url']).keys())
                except: suggestedTags=set()
                try:
                    suggestedTags.update(getCalaisTags(data['notes']))
                except: pass
                form = AddBookmarkForm(data)
        try:
            suggestedTags=set(suggestTags(form.cleaned_data['url']).keys())
        except: pass
        try:
            suggestedTags.update(getCalaisTags(form.cleaned_data['notes']))
        except: pass
        if hasattr(form, "cleaned_data"):
            tpl='add.html' if form.cleaned_data.get('popup','') == 1 else 'addWidget.html'
        else:
            tpl='addWidget.html'
        return render_to_response(tpl,
                                  { 'form': form,
                                    'suggestedTags': sorted(suggestedTags) },
                                  context_instance=RequestContext(request))

    # ok we have some valid form. let's save it.
    url=urlSanitize(form.cleaned_data['url'])
    try:
        obj=db.one({'url': url, 'user': unicode(user)})
    except ObjectDoesNotExist:
        obj=None

    if obj: # edit
        obj=db.Bookmark(obj)
        obj['private']=form.cleaned_data['private']
        obj['title']=sanitizeHtml(form.cleaned_data['title'])
        obj['notes']=sanitizeHtml(form.cleaned_data['notes'])
        obj['tags']=[sanitizeHtml(x) for x in form.cleaned_data['tags'].split(" ")]
        obj.save()
    else: # create
        snapshot=form.cleaned_data['page'].encode('utf8')
        if snapshot:
            hash=hashlib.sha512(snapshot).hexdigest()
            fname="%s/snapshots/%s" % (settings.BASE_PATH, hash)
            dump=gzip.open(fname,'wb')
            dump.write(snapshot)
            dump.close()
            snapshot=hash
        obj=db.Bookmark({'url': url,
                         'seq': getNextVal('seq'),
                         'user': unicode(request.user),
                         'created': datetime.today(),
                         'private': form.cleaned_data['private'],
                         'title': sanitizeHtml(form.cleaned_data['title']),
                         'notes': sanitizeHtml(form.cleaned_data['notes']),
                         'tags': [sanitizeHtml(x) for x in form.cleaned_data['tags'].split(' ')],
                         'snapshot': unicode(snapshot),
                        })
        obj.save()

    return HttpResponseRedirect("/v/%s" % base62.from_decimal(obj['seq']))

def getcsrf(request):
    done=False
    if request.method == 'GET':
        form = AddBookmarkForm(request.GET)
    elif request.method == 'POST':
        form = AddBookmarkForm(request.POST)
    else:
        return HttpResponse("wrong method")
    try: user=User.objects.get(username=request.user)
    except ObjectDoesNotExist:
        return HttpResponseRedirect("/accounts/login")
    return HttpResponse("%s" % str(csrf(request)['csrf_token']))

slugRe=re.compile(r'^[0-9A-Za-z]+$')
def getItemByUrl(url):
    db = get_database()[Bookmark.collection_name]
    if slugRe.match(url):
        item=db.find_one({'seq':base62.to_decimal(url)})
    else:
        url=fixApacheMadness(url)
        url=urlSanitize(url)
        item=db.find_one({'url':url})
    if not item:
        raise Http404
    return item

def view(request,shurl):
    item=getItemByUrl(shurl)
    item['shurl']=base62.from_decimal(item['seq'])

    if request.GET.get('format','') == 'json':
        del item['user']
        res={'url': unicode(item['url']),
             'title': unicode(item['title']),
             'created': tuple(item['created'].timetuple()),
             'private': item['private'],
             'notes': unicode(unescape(item['notes'])),
             'tags': item['tags'],
             'snapshot': item.get('snapshot')
             }
        return HttpResponse(json.dumps(res),
                            mimetype="application/json")
    else:
        return render_to_response('view.html',
                                  { 'item': item, },
                                  context_instance=RequestContext(request))

def shurlect(request,shurl):
    item=getItemByUrl(shurl)
    return HttpResponseRedirect("%s" % (item['url']))

def gmscript(request):
    #return HttpResponse(json.dumps(res),mimetype="application/json")
    return render_to_response('tagr.user.js',mimetype="application/javascript")

def delete(request,url):
    if not request.user.is_authenticated():
        return HttpResponseRedirect("/accounts/login")
    url=fixApacheMadness(url)
    try:
        user=User.objects.get(username=request.user)
        db = get_database()[Bookmark.collection_name]
        obj=db.remove({'url':url, 'user': unicode(request.user)})
    except ObjectDoesNotExist:
        print "meh delete not working. user, url or obj not existing"
    return HttpResponseRedirect('/u/%s/' % request.user)

def load(request):
    if not request.user.is_authenticated():
        return HttpResponseRedirect("/accounts/login")
    if request.method == 'POST':
        form = ImportDeliciousForm(request.POST,request.FILES)
        if form.is_valid():
            db = get_database()[Bookmark.collection_name]
            html=request.FILES['exported'].read().decode('utf8')
            soup=BeautifulSoup(html)
            for item in soup.findAll('dt'):
                desc=''
                next=item.findNextSiblings()
                if next:
                    next=next[0]
                    if 'name' in dir(next) and next.name=='dd':
                        desc=unescape(u''.join([unicode(x) for x in next.contents]))
                db.Bookmark({'url': urlSanitize(item.a['href']),
                             'seq': getNextVal('seq'),
                             'tags': [tag for tag in item.a['tags'].split(',')],
                             'user': unicode(request.user),
                             'created': datetime.fromtimestamp(float(item.a['add_date'])),
                             'private': item.a['private']=='1',
                             'title': unescape(unicode(item.a.string)),
                             'notes': unicode(desc)}).save()
            return HttpResponseRedirect('/u/%s/' % request.user)
    else:
        form = ImportDeliciousForm()
    return render_to_response('import.html', { 'form': form, }, context_instance=RequestContext(request) )

openCalaisParams=''.join(
    ['<c:params xmlns:c="http://s.opencalais.com/1/pred/" xmlns:rdf="http://www.w3.org/1999/02/22-rdf-syntax-ns#">',
     '<c:processingDirectives c:contentType="text/txt" c:enableMetadataType="SocialTags" c:outputFormat="application/json" c:docRDFaccesible="false" >',
     '</c:processingDirectives>',
     '<c:userDirectives c:allowDistribution="false" c:allowSearch="false" c:externalID="17cabs901" c:submitter="ABC">',
     '</c:userDirectives>',
     '<c:externalMetadata>',
     '</c:externalMetadata>',
     '</c:params>'])
def getCalaisTags(text):
    if not text:
        return []
    res=json.load(urllib2.urlopen('https://api.opencalais.com/enlighten/rest/',
                                    data=urllib.urlencode({'licenseID': conf.openCalaisAPIKey,
                                                           'content': text.encode('utf8'),
                                                           'paramsXML': openCalaisParams }) ))
    return ['-'.join(item['name'].lower().split(' '))
            for item in res.values()
            if '_typeGroup' in item and item['_typeGroup']=='socialTag'] # and int(item['importance'])>1]

def suggestTags(uri):
    tags=[]
    for plugin in plugins:
        tags.extend(plugin(uri))
    if not tags:
        return {}
    t={}
    for tag,type in tags:
        if not tag in t:
            t[tag]=type
        else:
            t[tag]="%s,%s" % (t[tag],type)
    return t

deliciousurl='https://api.del.icio.us/v1/posts/suggest?url='
def deliciousSuggested(uri):
    passman = urllib2.HTTPPasswordMgrWithDefaultRealm()
    passman.add_password(None, deliciousurl, conf.delicioususer, conf.deliciouspassword)
    authhandler = urllib2.HTTPBasicAuthHandler(passman)
    opener = urllib2.build_opener(authhandler)
    urllib2.install_opener(opener)
    tree = etree.parse(opener.open(deliciousurl+uri))
    return [(tag.text, tag.tag) for tag in tree.getroot()]


slashdotre=re.compile(r'https?://\w*.?slashdot.org/story/[0-9]*/[0-9]*/[0-9]*/[0-9]*/[^/?]*')
def slashdotTags(uri):
    results=[]
    if re.match(slashdotre,uri):
        soup = BeautifulSoup(urllib2.urlopen(uri))
        results=[(tag.string, 'slashdot') for tag in soup.findAll(attrs={'rel':"tag", 'class':"popular tag"})]
    return results

flickrre=re.compile(r'https?://www.flickr.com/photos/[^/]*/([^/]*)/')
def flickrTags(uri):
    m=re.match(flickrre,uri)
    results=[]
    if m:
        photo_id=m.group(1)
        url='http://api.flickr.com/services/rest/?method=flickr.photos.getInfo&api_key=%s&photo_id=%s'
        tree = etree.parse(urllib2.urlopen(url  % (conf.flickr['key'],photo_id)))
        #print etree.tostring(tree.getroot())
        results=([(tag.text, 'flickr') for tag in tree.findall('.//tag')])
    return results

def traverse(uri):
    results=[]
    for (url,user,password) in conf.peers:
        passman = urllib2.HTTPPasswordMgrWithDefaultRealm()
        passman.add_password(None, url, user, password)
        authhandler = urllib2.HTTPBasicAuthHandler(passman)
        opener = urllib2.build_opener(authhandler)
        urllib2.install_opener(opener)
        tree = etree.parse(opener.open("%stags/?uri=%s" % (url,uri)))
        results.extend([(tag.text, tag.get('class')) for tag in tree.getroot()])
    return results

def tags(request):
    uri=request.GET.get('uri','')
    if uri:
        tags=suggestTags(uri)
        if tags:
            return render_to_response('tags.html', { 'tags': sorted(tags.items()) })
        else:
            return HttpResponse("no result")
    return HttpResponse("no uri?")

#plugins=(deliciousSuggested, traverse, flickrTags, slashdotTags)
plugins=(deliciousSuggested, flickrTags, slashdotTags)

def bibtex(request, url):
	ctx = {}
	obj = getItemByUrl(url)

	ctx["type"] = "MISC"
	ctx["url"] = obj["url"]
	base = {"author": "", "title": "", "url": "", "year": "", "notes": ""}
	base.update(obj)
	ctx["bibtex"] = """
@MISC { tagr%(seq)s,
	author = "%(author)s",
	title = "%(title)s",
	howpublished = "\url{%(url)s}",
	year = "%(year)s",
	note = "%(notes)s",
}
""" % base

	return HttpResponse(json.dumps(ctx))

@gzip_page
def getSnapshot(request, hash):
    f=gzip.open("%s/snapshots/%s" % (settings.BASE_PATH, hash), 'rb')
    res=HttpResponse(f.read())
    f.close()
    return res
