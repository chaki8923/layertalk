import fs from 'node:fs/promises';
import {Presentation,PresentationFile,FileBlob} from '@oai/artifact-tool';
import {finalizePresentation} from '/Users/chakiryou/.codex/plugins/cache/openai-primary-runtime/presentations/26.905.11957/skills/presentations/container_tools/artifact_tool_utils.mjs';
const root='/Users/chakiryou/Desktop/LayerTalk';
const build=root+'/.sample-slides-build';
const out=root+'/output/feature-slides';
await fs.mkdir(out+'/png',{recursive:true});
const skill='/Users/chakiryou/.codex/plugins/cache/openai-primary-runtime/presentations/26.905.11957/skills/presentations';
const p=Presentation.create({slideSize:{width:1280,height:720}});
const data=[
 ['コメント表示','いつものスライドに、観客のリアクションが\nリアルタイムで届く。\n\nコメントやスタンプで、会場が盛り上がります。'],
 ['質問パネル','質問は流れず、パネルに残ります。\n\n発表中も見逃さず、\n好きなタイミングで回答できます。'],
 ['参加QR','スライドに参加用のQRコードを表示。\n\n観客はスマートフォンで読み取って、\nすぐに参加できます。'],
 ['コントロール窓','表示するモニターの切り替えも、\n参加URLの共有も。\n\nひとつの窓から、かんたんに操作できます。'],
 ['安全管理','NGワード設定、投稿の非表示、\n参加者のブロックを無料で。\n\n不適切な投稿を防ぎ、安心して発表できます。'],
 ['Event Pass','コメントの承認制、入室パスコード、\n発表レポート、ブランド設定を追加。\n\n購入した1ルームで7日間利用できます。\n自動更新はありません。']
];
function txt(s,text,x,y,w,h,size,color,bold=false){let a=s.shapes.add({geometry:'textbox',position:{left:x,top:y,width:w,height:h},fill:'none',line:{fill:'none',width:0}});a.text=text;a.text.style={typeface:'Hiragino Sans',fontSize:size,color,bold,autoFit:'none'};}
for(let i=0;i<data.length;i++){
 let s=p.slides.add();s.background.fill='#E5E8EB';
 txt(s,'LayerTalk',76,64,460,30,16,'#808A94');
 txt(s,data[i][0],76,204,545,80,42,'#56616D');
 txt(s,data[i][1],76,320,550,230,23,'#737E89');
 txt(s,String(i+1).padStart(2,'0'),76,641,90,30,15,'#89939C');
}
await (await PresentationFile.exportPptx(p)).save(build+'/features-candidate.pptx');
await finalizePresentation({workspaceDir:root,candidatePath:build+'/features-candidate.pptx',finalPath:out+'/feature-slides.pptx',pythonExecutable:'/Users/chakiryou/.cache/codex-runtimes/codex-primary-runtime/dependencies/python/bin/python3',integrityValidatorPath:skill+'/container_tools/inspect_presentation_package_integrity.py',layoutValidatorPath:skill+'/container_tools/inspect_presentation_layout_geometry.py',layoutArgs:['--expected-slide-size-emu','12192000,6858000','--validate-heading-fit'],explicitTotalSlideCount:6,fontPolicy:{basis:'design',families:['Hiragino Sans']},verifyArtifactToolImport:true,receiptPath:build+'/features-validation.json'});
const final=await PresentationFile.importPptx(await FileBlob.load(out+'/feature-slides.pptx'));
for(let i=0;i<6;i++) {let blob=await final.export({slide:final.slides.items[i],format:'png',scale:2});await fs.writeFile(out+'/png/slide-0'+(i+1)+'.png',new Uint8Array(await blob.arrayBuffer()));}
console.log(out);
