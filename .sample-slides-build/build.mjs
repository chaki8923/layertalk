import fs from 'node:fs/promises';
import {Presentation,PresentationFile,FileBlob} from '@oai/artifact-tool';
import {finalizePresentation} from '/Users/chakiryou/.codex/plugins/cache/openai-primary-runtime/presentations/26.905.11957/skills/presentations/container_tools/artifact_tool_utils.mjs';
const root='/Users/chakiryou/Desktop/LayerTalk';
const build=root+'/.sample-slides-build';
const out=root+'/output/sample-slides';
const skill='/Users/chakiryou/.codex/plugins/cache/openai-primary-runtime/presentations/26.905.11957/skills/presentations';
const p=Presentation.create({slideSize:{width:1280,height:720}});
const data=[
 ['チームの\nアイデア共有','小さな気づきから、次の一歩へ。'],
 ['今日のテーマ','日々の仕事で感じる\n「もう少し、こうだったら」を考えます。'],
 ['アイデアのヒント','時間がかかっていること\n何度も聞かれること\n少し工夫すると楽になること'],
 ['共有のしかた','思いついたことを、短い言葉で。\nまだまとまっていなくても大丈夫です。'],
 ['次に試すこと','集まったアイデアから、ひとつ選ぶ。\n小さく試して、気づきを持ち寄る。'],
 ['質問・感想','気になったことや、\n試してみたいことを教えてください。']
];
function txt(s,text,x,y,w,h,size,color,bold=false){let a=s.shapes.add({geometry:'textbox',position:{left:x,top:y,width:w,height:h},fill:'none',line:{fill:'none',width:0}});a.text=text;a.text.style={typeface:'Hiragino Sans',fontSize:size,color,bold,autoFit:'none'};}
for(let i=0;i<data.length;i++){
 let s=p.slides.add();s.background.fill='#E5E8EB';
 txt(s,'アイデア共有会',76,64,460,30,16,'#808A94');
 txt(s,data[i][0],76,i===0?205:204,545,i===0?150:80,i===0?50:42,'#56616D');
 txt(s,data[i][1],76,i===0?391:322,550,180,23,'#737E89');
 txt(s,String(i+1).padStart(2,'0'),76,641,90,30,15,'#89939C');
}
await (await PresentationFile.exportPptx(p)).save(build+'/candidate.pptx');
await finalizePresentation({workspaceDir:root,candidatePath:build+'/candidate.pptx',finalPath:out+'/sample-slides.pptx',pythonExecutable:'/Users/chakiryou/.cache/codex-runtimes/codex-primary-runtime/dependencies/python/bin/python3',integrityValidatorPath:skill+'/container_tools/inspect_presentation_package_integrity.py',layoutValidatorPath:skill+'/container_tools/inspect_presentation_layout_geometry.py',layoutArgs:['--expected-slide-size-emu','12192000,6858000','--validate-heading-fit'],explicitTotalSlideCount:6,fontPolicy:{basis:'design',families:['Hiragino Sans']},verifyArtifactToolImport:true,receiptPath:build+'/validation.json'});
const final=await PresentationFile.importPptx(await FileBlob.load(out+'/sample-slides.pptx'));
for(let i=0;i<6;i++) {let blob=await final.export({slide:final.slides.items[i],format:'png',scale:2});await fs.writeFile(out+'/png/slide-0'+(i+1)+'.png',new Uint8Array(await blob.arrayBuffer()));}
console.log(out);
