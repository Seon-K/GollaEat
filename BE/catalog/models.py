from django.db import models


class Restaurant(models.Model):
    place_id = models.CharField(max_length=100, primary_key=True)
    name = models.CharField(max_length=500)
    data = models.JSONField(default=dict)


class Menu(models.Model):
    preprocess_row_id = models.CharField(max_length=100, primary_key=True)
    restaurant = models.ForeignKey(Restaurant, on_delete=models.PROTECT, related_name='menus')
    name = models.CharField(max_length=500)
    price_amount = models.BigIntegerField(null=True, blank=True, db_index=True)
    data = models.JSONField(default=dict)
