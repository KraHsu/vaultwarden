// Move the short-lived authorization response out of the URL query before loading the app.
location.replace('/#sso?'+location.search.slice(1));
