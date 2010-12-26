from django.db import models
from django.contrib.auth.models import User
from django.core.exceptions import ObjectDoesNotExist

# Create your models here.

class Tag(models.Model):
    name = models.CharField(max_length=200, db_index=True) # yes longer tags than tweets! ;)

    def __unicode__(self):
        return self.name

    @staticmethod
    def get(name):
        try:
            t=Tag.objects.get(name=name)
        except ObjectDoesNotExist:
            t=Tag(name=name)
            t.save()
        return t

class URI(models.Model):
    url = models.TextField(unique=True,db_index=True)
    def __unicode__(self):
        return self.url

class Bookmark(models.Model):
    tags = models.ManyToManyField(Tag)
    user = models.ForeignKey(User,db_index=True)
    url = models.ForeignKey(URI,db_index=True)
    created = models.DateTimeField(db_index=True)
    updated = models.DateTimeField()
    private = models.BooleanField()
    title = models.TextField()
    notes = models.TextField()

    def __unicode__(self):
        return self.title
