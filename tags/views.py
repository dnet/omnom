# Create your views here.

from models import URI
from django.http import HttpResponse
from django.shortcuts import render_to_response
from tagger import conf
from lxml import etree
from BeautifulSoup import BeautifulSoup
import urllib2, re

def delicious(request):
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
        tags=[]
        for plugin in plugins:
            tags.extend(plugin(uri))
        if tags:
            t={}
            for tag,type in tags:
                if not tag in t:
                    t[tag]=type
                else:
                    t[tag]="%s,%s" % (t[tag],type)
            return render_to_response('tags.html', { 'tags': sorted(t.items()) })
        else:
            return HttpResponse("no result")
    return HttpResponse("no uri?")

#plugins=(deliciousSuggested, traverse, localTags, flickrTags, slashdotTags)
plugins=(deliciousSuggested, localTags, flickrTags, slashdotTags)

