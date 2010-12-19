# Create your views here.

from models import URI
from django.http import HttpResponse
from django.shortcuts import render_to_response
from tagger import conf
from tagger.utils import unescape
from tagger.tags.forms import AddBookmarkForm
from lxml import etree
from BeautifulSoup import BeautifulSoup
import urllib2, re, urllib, json

#TODO split bookmarking and url tagging

def getOne(request):
    uri=request.GET.get('uri','')
    if uri:
        obj=URI.objects.filter(url=uri)
        if len(obj)>1:
            return HttpResponse("more than 1 result")
        if len(obj):
            return render_to_response('delicious.html', {'url': obj[0].url,
                                                    'title': obj[0].title,
                                                    'created': obj[0].created,
                                                    'private': obj[0].private,
                                                    'notes': obj[0].notes,
                                                    'tags': ','.join((unicode(x) for x in obj[0].tags.all()))
                                                    })
        else:
            return HttpResponse("no result")
    return HttpResponse("no uri?")

def recent(request):
    limit=10
    try: limit=int(request.GET.get('limit'))
    except: pass
    #if request.GET.get('format','')=="RSS":
    #    template='recent-rss.html'
    res=URI.objects.order_by('created').reverse()[:limit]
    if res:
        return render_to_response('recent-xfolk.html', {'items': [{'url': obj.url,
                                                                   'title': obj.title,
                                                                   'created': obj.created,
                                                                   'private': obj.private,
                                                                   'notes': unescape(obj.notes),
                                                                   'tags': [unicode(x) for x in obj.tags.all()]
                                                                   } for obj in res]})
    else:
        return HttpResponse("no result")

def add(request):
    form = AddBookmarkForm(request.GET)
    if not form.is_valid():
        return render_to_response('add.html', { 'form': form, })

    if form.cleaned_data['popup']:
        suggestedTags=set(suggestTags(form.cleaned_data['url']).keys())
        suggestedTags.update(getCalaisTags(form.cleaned_data['notes']))
        return render_to_response('add.html', { 'form': form, 'suggestedTags': sorted(suggestedTags) })

openCalaisParams=''.join(['<c:params xmlns:c="http://s.opencalais.com/1/pred/" xmlns:rdf="http://www.w3.org/1999/02/22-rdf-syntax-ns#">',
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

