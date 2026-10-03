"""체험용 페이지(claude.ai 아티팩트) 생성: index.html 에서 문서 뼈대와 PWA 링크만 빼고 같은 css/js 를 씁니다."""
import re, pathlib
root = pathlib.Path(__file__).resolve().parent.parent
html = (root / 'index.html').read_text(encoding='utf-8')
head = re.search(r'<head>(.*)</head>', html, re.S).group(1)
body = re.search(r'<body>(.*)</body>', html, re.S).group(1)
keep = [l for l in head.splitlines() if re.search(r'<title|fonts\.g|css/app\.css', l)]
out = '\n'.join(keep) + '\n' + body.strip() + '\n'
dest = root / 'demo' / 'index.html'
dest.parent.mkdir(exist_ok=True)
dest.write_text(out, encoding='utf-8')
print('wrote', dest)
