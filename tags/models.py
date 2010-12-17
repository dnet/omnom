from django.db import models

# Create your models here.

class Tag(models.Model):
    name = models.CharField(max_length=200) # yes longer tags than tweets! ;)

class URI(models.Model):
    tag = models.ManyToManyField(Tag)
    url = models.TextField()
    created = models.DateTimeField()
    private = models.BooleanField()
    title = models.TextField()
    notes = models.TextField()

