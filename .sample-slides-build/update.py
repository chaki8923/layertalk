from pathlib import Path
p=Path('/Users/chakiryou/Desktop/LayerTalk/.sample-slides-build/build.mjs')
s=p.read_text()
s=s.replace("const out=root+'/output/sample-slides';", "const out=root+'/output/feature-slides';\nawait fs.mkdir(out+'/png',{recursive:true});")
a=s.index('const data=[')
b=s.index('function txt',a)
s=s[:a]+'''const data=[
 ['コメント表示','いつものスライドに、観客のリアクションが\\nリアルタイムで届く。\\n\\nコメントやスタンプで、会場が盛り上がります。'],
 ['質問パネル','質問は流れず、パネルに残ります。\\n\\n発表中も見逃さず、\\n好きなタイミングで回答できます。'],
 ['参加QR','スライドに参加用のQRコードを表示。\\n\\n観客はスマートフォンで読み取って、\\nすぐに参加できます。'],
 ['コントロール窓','表示するモニターの切り替えも、\\n参加URLの共有も。\\n\\nひとつの窓から、かんたんに操作できます。'],
 ['安全管理','NGワード設定、投稿の非表示、\\n参加者のブロックを無料で。\\n\\n不適切な投稿を防ぎ、安心して発表できます。'],
 ['Event Pass','コメントの承認制、入室パスコード、\\n発表レポート、ブランド設定を追加。\\n\\n購入した1ルームで7日間利用できます。\\n自動更新はありません。']
];
'''+s[b:]
s=s.replace("txt(s,'アイデア共有会'", "txt(s,'LayerTalk'")
s=s.replace("76,i===0?205:204,545,i===0?150:80,i===0?50:42", "76,204,545,80,42")
s=s.replace("76,i===0?391:322,550,180,23", "76,320,550,230,23")
s=s.replace('sample-slides.pptx','feature-slides.pptx').replace("build+'/candidate.pptx'", "build+'/features-candidate.pptx'").replace("build+'/validation.json'", "build+'/features-validation.json'")
Path('/Users/chakiryou/Desktop/LayerTalk/.sample-slides-build/build-features.mjs').write_text(s)
