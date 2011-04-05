from django.conf.urls.defaults import *
from django.conf import settings
from tags import views as tags

# Uncomment the next two lines to enable the admin:
# from django.contrib import admin
# admin.autodiscover()

urlpatterns = patterns('',
    (r'^accounts/logout$', 'django.contrib.auth.views.logout', {'next_page' : '/'}),
    (r'^accounts/', include('registration.urls')),
    (r'^tagr\.user\.js', tags.gmscript),
    (r'^tags/', tags.tags),
    (r'^add/', tags.add),
    (r'^c/', tags.getcsrf),
    (r'^edit/(?P<url>.+)', tags.add),
    (r'^del/(?P<url>.+)', tags.delete),
    (r'^bibtex/(?P<url>.+)', tags.bibtex),
    (r'^import/', tags.load),
    (r'^v/(?P<shurl>.+)?', tags.view),
    (r'^r/(?P<shurl>.+)?', tags.shurlect),
    (r'^s/(?P<hash>.+)?', tags.getSnapshot),
    (r'^$', tags.show),                                       # list all (except private)
    (r'^t/(?P<tags>.+)?', tags.show),                         # ... filtered by tags
    (r'^u/(?P<user>.+)/$', tags.show),                        # list only users items
    (r'^u/(?P<user>.+)/(?P<tags>.+)?$', tags.show),           # ... filtered by tags

    # Uncomment the next line to enable the admin:
    #(r'^admin/', include(admin.site.urls)),
)

if settings.DEV_SERVER:
    urlpatterns += patterns('',
        (r'^site_media/(?P<path>.*)$', 'django.views.static.serve', {'document_root': settings.MEDIA_PATH}),
    )
