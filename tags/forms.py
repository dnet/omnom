from django import forms
from django.conf import settings

class AdvancedEditor(forms.Textarea):
	class Media:
		js = (settings.MEDIA_URL+'/js/tinymce/tiny_mce.js',)

	def __init__(self, language=None, attrs=None):
		self.language = language or settings.LANGUAGE_CODE[:2]
		self.attrs = {'class': 'advancededitor'}
		if attrs: self.attrs.update(attrs)
		super(AdvancedEditor, self).__init__(attrs)

class AddBookmarkForm(forms.Form):
    url =forms.CharField(required=True, label="UR Location")
    title = forms.CharField(required=True, label="Title")
    tags = forms.CharField(required=False, label="Tags")
    suggestedTags = forms.CharField(required=False, label="Suggested Tags")
    notes = forms.CharField(required=False, widget=AdvancedEditor(), label="Notes")
    private = forms.BooleanField(required=False, label="Private")
    popup = forms.BooleanField(required=False)
