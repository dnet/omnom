from models import Bookmark, Tag, URI
from django.http import HttpResponse, HttpResponseRedirect
from django.shortcuts import render_to_response
from django.core.paginator import Paginator, InvalidPage, EmptyPage
from django.core.exceptions import ObjectDoesNotExist
from django.db.models import Q
from django.contrib.auth import authenticate, login
from django.contrib.auth.models import User
from django.template import RequestContext
from tagger import conf
from tagger.utils import unescape
from tagger.tags.forms import AddBookmarkForm, ImportDeliciousForm
from lxml import etree
from BeautifulSoup import BeautifulSoup
from datetime import datetime
import urllib2, re, urllib, json

#TODO split bookmarking and url tagging

def list(request,tags=[],user=None):
    if user:
        try: user = User.objects.get(username=user)
        except ObjectDoesNotExist: return HttpResponse("no such user")

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

    query=Bookmark.objects
    if user and request.user!=user:
        query=query.filter(private=0)
    if user:
        query=query.filter(user=user)
    if tags:
        tags=urllib.unquote_plus(tags).split(' ')
        for tag in tags:
            if not tag: continue
            try: t=Tag.objects.get(name=tag)
            except ObjectDoesNotExist: continue
            query=query.filter(tags=t)

    query=query.order_by('created').reverse()

    tagcloud=[]
    if (tags or user) and request.GET.get('format','') == '':
        timetags={}
        for item in query:
            d=item.created.strftime("%Y-%m-%d")
            timetags[d]=timetags.get(d,{})
            for t in item.tags.all():
                if t.name in tags: continue
                timetags[d][t.name]=timetags[d].get(t.name,0)+1
        tagcloud=[(k, sorted(v.items())) for k, v in sorted(timetags.items())]
    total=query.count()
    paginator = Paginator(query, limit)
    try:
        res = paginator.page(page)
    except (EmptyPage, InvalidPage):
        res = paginator.page(paginator.num_pages)

    if request.GET.get('format','') == 'json':
        res=[{'url': unicode(obj.url),
              'title': unicode(obj.title),
              'created': tuple(obj.created.timetuple()),
              'updated': tuple(obj.updated.timetuple()),
              'private': obj.private,
              'notes': unicode(unescape(obj.notes)),
              'tags': [unicode(x) for x in obj.tags.all()]
              } for obj in res.object_list]
        return HttpResponse(json.dumps(res),mimetype="application/json")

    if request.GET.get('format','') == 'atom':
        tpl='atom.xml'
    else:
        tpl='list.html'

    res.object_list=[{'url': obj.url,
                      'user': obj.user,
                      'title': obj.title,
                      'created': obj.created,
                      'updated': obj.updated,
                      'private': obj.private,
                      'notes': unescape(obj.notes),
                      'tags': [unicode(x) for x in obj.tags.all()]
                      } for obj in res.object_list]
    return render_to_response(tpl, { 'items': res,
                                     'limit': limit,
                                     'total': total,
                                     'tags': [(tag, "+".join([t for t in tags if not t == tag]) if len(tags)>1 else path) for tag in tags] if tags else [],
                                     'tagcloud': json.dumps(tagcloud),
                                     'baseurl': baseurl,
                                     'path': request.path},
                             context_instance=RequestContext(request) )

def add(request,url=None):
    form = AddBookmarkForm(request.GET)
    try: user=User.objects.get(username=request.user)
    except ObjectDoesNotExist:
        return HttpResponseRedirect("/accounts/login")
    if not form.is_valid() or form.cleaned_data['popup']:
        if url: # try to edit an existing bookmark?
            try:
                url=URI.objects.get(url=url)
                obj=Bookmark.objects.get(url=url, user=user)
            except ObjectDoesNotExist: obj=None
            if obj: # yes, edit an existing bookmark
                data={ 'url' : url,
                       'title' : obj.title,
                       'tags' : ', '.join([unicode(x) for x in obj.tags.all()]),
                       'notes' : obj.notes,
                       'private' : obj.private,
                       'popup' : True }
                form = AddBookmarkForm(data)
        try:
            suggestedTags=set(suggestTags(form.cleaned_data['url']).keys())
            suggestedTags.update(getCalaisTags(form.cleaned_data['notes']))
        except: suggestedTags=set()
        return render_to_response('add.html', { 'form': form, 'suggestedTags': sorted(suggestedTags) }, context_instance=RequestContext(request))

    # ok we have some valid form. let's save it.
    try:
        url=URI.objects.get(url=form.cleaned_data['url'])
    except ObjectDoesNotExist:
        url=URI(url=form.cleaned_data['url'])
        url.save()
    try:
        obj=Bookmark.objects.get(url=url, user=user)
    except ObjectDoesNotExist:
        obj=None

    if obj: # edit
        obj.updated=datetime.today()
        obj.private=form.cleaned_data['private']
        obj.title=form.cleaned_data['title']
        obj.notes=form.cleaned_data['notes']
        obj.tags.all().delete()
    else: # create
        obj=Bookmark(url=url,
                     user=request.user,
                     created=datetime.today(),
                     updated=datetime.today(),
                     private=form.cleaned_data['private'],
                     title=form.cleaned_data['title'],
                     notes=form.cleaned_data['notes'],
                     )
    obj.save()
    obj.tags.add(*[Tag.get(tag) for tag in form.cleaned_data['tags'].split(',')])
    return HttpResponseRedirect("/u/%s/" % request.user)

def delete(request,url):
    try:
        user=User.objects.get(username=request.user)
        url=URI.objects.get(url=url)
        obj=Bookmark.objects.get(url=url, user=request.user).delete()
    except ObjectDoesNotExist:
        print "meh delete not working. user, url or obj not existing"
    return HttpResponseRedirect('/u/%s/' % request.user)

TAGCACHE={}
def getTag(name):
    if not name in TAGCACHE:
        TAGCACHE[name]=Tag(name=name)
        TAGCACHE[name].save()
    return TAGCACHE[name]

def load(request):
    if not request.user.is_authenticated():
        return HttpResponseRedirect("/accounts/login")
    if request.method == 'POST':
        form = ImportDeliciousForm(request.POST,request.FILES)
        if form.is_valid():
            html=request.FILES['exported'].read().decode('utf8')
            soup=BeautifulSoup(html)
            for item in soup.findAll('dt'):
                desc=''
                next=item.findNextSiblings()
                if next:
                    next=next[0]
                    if 'name' in dir(next) and next.name=='dd':
                        desc=unescape(u''.join([unicode(x) for x in next.contents]))
                try:
                    url=URI.objects.get(url=item.a['href'])
                except ObjectDoesNotExist:
                    url=URI(url=item.a['href'])
                    url.save()
                uri=Bookmark(url=url,
                             user=request.user,
                             created=datetime.fromtimestamp(float(item.a['add_date'])),
                             updated=datetime.now(),
                             private=item.a['private']=='1',
                             title=unescape(unicode(item.a.string)),
                             notes=desc)
                uri.save()
                uri.tags.add(*[getTag(tag) for tag in item.a['tags'].split(',')])
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

def localTags(uri):
    obj=URI.objects.filter(url=uri)
    if len(obj)>1:
        return HttpResponse("more than 1 result")
    if len(obj):
        return [(unicode(x),'local') for x in obj[0].tags.all()]
    else:
        return []

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

#plugins=(deliciousSuggested, traverse, localTags, flickrTags, slashdotTags)
plugins=(deliciousSuggested, localTags, flickrTags, slashdotTags)

