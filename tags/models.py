from django.db import models

# Create your models here.

class Tag(models.Model):
    name = models.CharField(max_length=200) # yes longer tags than tweets! ;)

    def __unicode__(self):
        return self.name

class URI(models.Model):
    tags = models.ManyToManyField(Tag)
    url = models.TextField(unique=True,db_index=True)
    created = models.DateTimeField()
    private = models.BooleanField()
    title = models.TextField()
    notes = models.TextField()

    def __unicode__(self):
        return self.url
