from django.core.management.base import BaseCommand, CommandError
from tagger.tags.models import Tag, URI

from BeautifulSoup import BeautifulSoup
from datetime import datetime
import sys, tidy, re, htmlentitydefs

def unescape(text):
    def fixup(m):
        text = m.group(0)
        if text[:2] == "&#":
            # character reference
            try:
                if text[:3] == "&#x":
                    return unichr(int(text[3:-1], 16))
                else:
                    return unichr(int(text[2:-1]))
            except ValueError:
                pass
        else:
            # named entity
            try:
                text = unichr(htmlentitydefs.name2codepoint[text[1:-1]])
            except KeyError:
                pass
        return text # leave as is
    return re.sub("&#?\w+;", fixup, text)

TAGCACHE={}
def getTag(name):
    if not name in TAGCACHE:
        TAGCACHE[name]=Tag(name=name)
        TAGCACHE[name].save()
    return TAGCACHE[name]

class Command(BaseCommand):
    args = '<delicious bookmark dump>'
    help = 'imports a delicious bookmark file'

    def handle(self, *args, **options):
        for file in args:
            f=open(file)
            raw=f.readlines()
            f.close()
            html=unescape(str(tidy.parseString(' '.join(raw), **{'output_xhtml' : 1,
                                                                 'add_xml_decl' : 0,
                                                                 'indent' : 0,
                                                                 'tidy_mark' : 0,
                                                                 'doctype' : "strict",
                                                                 'char-encoding' : "utf8",
                                                                 'wrap' : 0})).decode('utf8'))
            soup=BeautifulSoup(html)
            for item in soup.findAll('dt'):
                desc=''
                next=item.findNextSiblings()[0]
                if 'name' in dir(next) and next.name=='dd':
                    desc=u''.join([unicode(x) for x in next.contents])
                uri=URI(url=item.a['href'],
                    created=datetime.fromtimestamp(float(item.a['add_date'])),
                    private=item.a['private'],
                    title=unicode(item.a.string),
                    notes=desc)
                uri.save()
                uri.tags.add(*[getTag(tag) for tag in item.a['tags'].split(',')])
                #print uri,uri.created,uri.tags.all()

            self.stdout.write('Successfully imported bookmarks\n')
