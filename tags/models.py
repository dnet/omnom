from django.contrib.auth.models import User
from django.core.exceptions import ObjectDoesNotExist
from django_mongokit import connection
from django_mongokit.document import DjangoDocument
from counter import getNextVal
import datetime

class Bookmark(DjangoDocument):
    class Meta:
        verbose_name_plural = "Bookmarks"

    collection_name = 'bookmarks'
    structure = {
        'seq': int,
        'tags': [unicode],
        'user': unicode,
        'url': unicode,
        'created': datetime.datetime,
        'private': bool,
        'title': unicode,
        'notes': unicode,
        'snapshot': [unicode],
        #'author': unicode,
        #'year': unicode,
        }

    default_values = {
        'created': datetime.datetime.utcnow,
        'seq': getNextVal,
        }

    use_dot_notation = True

    indexes = [
        {'fields': ['user','url','created', 'seq']},
        ]
    def __unicode__(self):
        return self.title

connection.register([Bookmark])
