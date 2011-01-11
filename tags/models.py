from django.contrib.auth.models import User
from django.core.exceptions import ObjectDoesNotExist
from django_mongokit import connection
from django_mongokit.document import DjangoDocument
import datetime

class Bookmark(DjangoDocument):
    class Meta:
        verbose_name_plural = "Bookmarks"

    collection_name = 'bookmarks'
    structure = {
        'tags': [unicode],
        'user': unicode,
        'url': unicode,
        'created': datetime.datetime,
        'updated': datetime.datetime,
        'private': bool,
        'title': unicode,
        'notes': unicode,
        }

    default_values = {
        'created': datetime.datetime.utcnow,
        }

    use_dot_notation = True

    indexes = [
        {'fields': ['user','url','created']},
        ]
    def __unicode__(self):
        return self.title

connection.register([Bookmark])
