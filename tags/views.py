# Create your views here.

from models import URI
from django.http import HttpResponse
from django.shortcuts import render_to_response

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

def tags(request):
    uri=request.GET.get('uri','')
    if uri:
        obj=URI.objects.filter(url=uri)
        if len(obj)>1:
            return HttpResponse("more than 1 result")
        if len(obj):
            return render_to_response('tags.html', { 'tags': (unicode(x) for x in obj[0].tags.all()) })
        else:
            return HttpResponse("no result")
    return HttpResponse("no uri?")
