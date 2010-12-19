from django.conf.urls.defaults import *
from django.conf import settings
from tags import views as tags

# Uncomment the next two lines to enable the admin:
# from django.contrib import admin
# admin.autodiscover()

urlpatterns = patterns('',
    # Example:
    (r'^getOne/', tags.getOne),
    (r'^add/', tags.add),
    (r'^recent/', tags.recent),
    (r'^tags/', tags.tags),
    #(r'^import/$', tags.import),
    (r'^list/$', tags.list),
    (r'^list/(?P<tags>.+)', tags.list),
    (r'^accounts/logout/$', 'django.contrib.auth.views.logout', {'next_page' : '/recent/'}),
    (r'^accounts/', include('registration.urls')),
    (r'^(?P<username>.+)/$', tags.list),

    # Uncomment the admin/doc line below to enable admin documentation:
    # (r'^admin/doc/', include('django.contrib.admindocs.urls')),

    # Uncomment the next line to enable the admin:
    #(r'^admin/', include(admin.site.urls)),
)

if settings.DEV_SERVER:
    urlpatterns += patterns('',
        (r'^site_media/(?P<path>.*)$', 'django.views.static.serve', {'document_root': settings.MEDIA_PATH}),
    )
