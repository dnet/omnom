from tempfile import mkdtemp
from subprocess import Popen, call, PIPE
from shutil import rmtree
from os import mkdir
from cStringIO import StringIO
from threading import Thread
from urllib2 import urlopen, Request, URLError
from urlparse import urljoin, urlparse, urlunparse
from urllib import unquote_plus

class HeadRequest(Request):
    def get_method(self):
        return "HEAD"

def snapshot(url):
    # check availability of url
    try:
        response = urlopen(HeadRequest(url))
    except URLError, e:
        return e, url
    t=response.info().get('Content-Type')
    i=t.find(';')
    if i>=0:
        t=t[:i]
    if not t in ['text/xml',
                 'text/html']:
        return "sorry wrong type (%s)! %s" % (t,url)
    try:
        l=int(response.info().get('Content-Length','0'))
    except:
        return "sorry wrong length(%s)! %s" % (l,url)
    if l>1024*1024*10:
        return "sorry too big (%dMB)! %s" % (l/(1024*1024),url)

    d=mkdtemp()

    # mirror the url
    pagedir="%s/contents" % d
    mkdir(pagedir)
    ret=Popen(['/usr/bin/wget', '-q', '-E', '-H', '-k', '-K', '-p', url],
              cwd=pagedir).wait()
    if ret != 0:
        return 'download error', ret

    # compress the snapshot
    ret=Popen(['/usr/bin/zip', '-r', '-q', 'contents.zip', 'contents'],
                  cwd=d).wait()
    if ret != 0:
        return 'compression error', ret

    # calculate hashsums
    pcs=urlparse(unquote_plus(url))
    tmp=list(pcs)
    rootdoc='contents/%s/%s' % (tmp[1],tmp[2])
    if rootdoc[-1]=='/':
        rootdoc="%sindex.html" % rootdoc
    hashs={}
    for hsh in ['md5sum', 'sha1sum', 'sha224sum', 'sha256sum', 'sha384sum', 'sha512sum']:
        val=Popen(['/usr/bin/%s' % hsh, rootdoc],
                  stdout=PIPE,
                  cwd=d).communicate()[0]
        hashs[hsh[:-3]]=val.split('\n')[0].split(' ',2)[0]
    zhashs={}
    for hsh in ['md5sum', 'sha1sum', 'sha224sum', 'sha256sum', 'sha384sum', 'sha512sum']:
        val=Popen(['/usr/bin/%s' % hsh, 'contents.zip'],
                  stdout=PIPE,
                  cwd=d).communicate()[0]
        hashs[hsh[:-3]]=val.split('\n')[0].split(' ',2)[0]

    rmtree(d)
    return (rootdoc, hashs, '%s/contents.zip' % d, zhashs)

def worker(url,fn=snapshot):
    print fn(url)

if __name__ == "__main__":
    import pymongo
    conn = pymongo.Connection()
    db=conn.tagger
    bm=db.bookmarks
    urls=[i['url'] for i in bm.find({},['url'])]
    print urls
    #urls=['http://docs.python.org/library/subprocess.html#module-subprocess',
    #      'http://docs.python.org/library/multiprocessing.html',
    #      'http://dos.python.org/library/multiprocessing.html',
    #      'http://docs.python.org/library/xultiprocessing.html',
    #      'http://code.activestate.com/recipes/203871-a-generic-programming-thread-pool/',
    #      'http://docs.python.org/library/urllib2.html',
    #      ]
    #from multiprocessing import Pool
    #p = Pool(3)
    #p.map(worker, urls)
