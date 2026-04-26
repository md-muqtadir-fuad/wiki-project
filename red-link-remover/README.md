## Bengali Red Link Remover
A refactored and localized version of the "Red Link Remover" tool. This script identifies broken internal links (red links) and automatically converts them to plain text or removes them (for categories) while preserving the article's integrity.

**Key Features:**
* **Native Numeral Conversion:** Automatically converts count statistics into Bengali digits (০-৯) for edit summaries.
* **Dynamic Namespace Detection:** Uses the MediaWiki API to detect local namespaces (e.g., "বিষয়শ্রেণী" for Categories).
* **State Persistence:** Uses `localStorage` to bridge data between the article view and the editor.
* **Template Cleanup:** Automatically removes redundant cleanup templates like `{{Too many red links}}`.

---

## 🛠 Installation

To use these scripts on Wikipedia, add the following to your **common.js** page:

```javascript
// Example for Red Link Remover
importScript('User:Md._Muqtadir_Fuad/script-redlinks.js');
```
## Caution Note
[READ before using(Bengali)](https://bn.wikipedia.org/wiki/%E0%A6%AC%E0%A7%8D%E0%A6%AF%E0%A6%AC%E0%A6%B9%E0%A6%BE%E0%A6%B0%E0%A6%95%E0%A6%BE%E0%A6%B0%E0%A7%80:Md._Muqtadir_Fuad/script-redlinks)

---
### Inspiration:<br>
- [Remove redlinks: Alex 21](https://en.wikipedia.org/wiki/User:Alex_21/script-redlinks)<br>
- [Improvement: Aftabujjaman](https://bn.wikipedia.org/wiki/%E0%A6%AC%E0%A7%8D%E0%A6%AF%E0%A6%AC%E0%A6%B9%E0%A6%BE%E0%A6%B0%E0%A6%95%E0%A6%BE%E0%A6%B0%E0%A7%80:%E0%A6%86%E0%A6%AB%E0%A6%A4%E0%A6%BE%E0%A6%AC%E0%A7%81%E0%A6%9C%E0%A7%8D%E0%A6%9C%E0%A6%BE%E0%A6%AE%E0%A6%BE%E0%A6%A8)

