from django.conf.urls.defaults import *
from django.conf import settings
from tags import views as tags

# Uncomment the next two lines to enable the admin:
# from django.contrib import admin
# admin.autodiscover()

urlpatterns = patterns('',
    (r'^accounts/logout$', 'django.contrib.auth.views.logout', {'next_page' : '/'}),
    (r'^accounts/', include('registration.urls')),
    (r'^tags/', tags.tags),
    (r'^add/', tags.add),
    (r'^edit/(?P<url>.+)', tags.add),
    (r'^del/(?P<url>.+)', tags.delete),
    (r'^import/', tags.load),
    (r'^$', tags.list),                                       # list all (except private)
    (r'^t/(?P<tags>.+)?', tags.list),                         # ... filtered by tags
    (r'^u/(?P<user>.+)/$', tags.list),                        # list only users items
    (r'^u/(?P<user>.+)/(?P<tags>.+)?$', tags.list),           # ... filtered by tags

    # Uncomment the next line to enable the admin:
    #(r'^admin/', include(admin.site.urls)),
)

if settings.DEV_SERVER:
    urlpatterns += patterns('',
        (r'^site_media/(?P<path>.*)$', 'django.views.static.serve', {'document_root': settings.MEDIA_PATH}),
    )
