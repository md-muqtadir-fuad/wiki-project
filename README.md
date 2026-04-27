# WikiProject: MediaWiki Scripts & Automation

A centralized repository for localized user scripts, gadgets, and technical tools designed to enhance the editing experience and automate maintenance tasks across Wikipedia projects, with a focus on the Bengali Wikipedia (bn.wiki).

---

## Projects

### 1. Bengali Red Link Remover (`red-link-remover`)
A refactored and localized version of the "Red Link Remover" tool.

To use this scripts on Wikipedia, add the following to your **common.js** page:

```javascript
// Example for Red Link Remover
importScript('User:Md._Muqtadir_Fuad/script-redlinks.js');
```

---
### Bengali Wikipedia Internal Link Helper(`bnwiki-internal-links`)

**bnwiki-internal-links** is a MediaWiki user script for **Bengali Wikipedia** (`bn.wikipedia.org`).  
It helps editors add internal links by detecting Bengali article titles inside wikitext and converting suitable text into wikilinks.

To use this scripts on Wikipedia, add the following to your **common.js** page:
```javascript
mw.loader.load('/w/index.php?title=ব্যবহারকারী:Md._Muqtadir_Fuad/bnwiki-internal-links.js&action=raw&ctype=text/javascript');
```