# Volvo Selekt CZ incremental crawler

Expected input:

```
{
    "startUrl":"https://selekt.volvocars.cz/cs/ojete-vozy/xhr-results/1?model=1477&price_type_switch=price&price_to=772000&km_to=72000&reg_date_from=2017&manufacturer=64&allow_no_price=1&sort=price%3AASC&max=12&view=",
    "email": "email1",
    "ccEmail": "email2"
}

```
You will receive incrementally new cars from the site.

To get the starturl open networks while loading the results and copy the url.
