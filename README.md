NOT for production.

Use for learning if you wish, but in any case, I strongly recommend swapping out the Elastic-search backend unless you really know how to work with Elastic Search. Also, I think using KOA/generators was a poor chioce vs using promises. Generators are way more difficult to debug (IMHO).

So, never use ES as a primary backend, and use express or HAPI instead of Koa (I think).
