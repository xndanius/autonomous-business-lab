from reportlab.pdfgen import canvas
from reportlab.lib.colors import HexColor
from reportlab.lib.pagesizes import A4
from reportlab.platypus import Paragraph
from reportlab.lib.styles import ParagraphStyle
from reportlab.graphics.barcode.qr import QrCodeWidget
from reportlab.graphics.shapes import Drawing
from reportlab.graphics import renderPDF
from pathlib import Path
out=Path(__file__).resolve().parents[1]/'resources/challenge.pdf'
c=canvas.Canvas(str(out),pagesize=A4);c.setTitle('One loop. Real users. - SSE Riga four-week challenge');c.setAuthor('Autonomous Business Lab')
W,H=A4;ink=HexColor('#17231e');soft=HexColor('#53625a');green=HexColor('#416b26');line=HexColor('#d2dfcb');margin=38
c.setFillColor(HexColor('#f5f7f0'));c.rect(0,0,W,H,fill=1,stroke=0)
def text(x,y,value,size=10,color=ink,font='Helvetica'):
 c.setFillColor(color);c.setFont(font,size);c.drawString(x,y,value)
def para(value,x,y,width,size=10,color=ink,leading=None):
 s=ParagraphStyle('p',fontName='Helvetica',fontSize=size,leading=leading or size*1.34,textColor=color)
 p=Paragraph(value,s);w,h=p.wrap(width,999);p.drawOn(c,x,y-h);return y-h
text(margin,H-40,'AUTONOMOUS BUSINESS LAB  /  SSE RIGA',9,green,'Helvetica-Bold')
text(margin,H-84,'One loop. Real users.',31,ink,'Helvetica-Bold')
y=para('In four weeks, launch something real and useful that people use every week, and let its routine run without you. The topic is open. The users must be real.',margin,H-104,W-2*margin,11,soft)
y-=25;text(margin,y,'YOUR FOUR WEEKS',10,green,'Helvetica-Bold');y-=13
weeks=[('1','Practise and ship','Use an AI coding agent daily. Put a first version in front of 5 real users.'),('2','Make the loop run','Run every day. Reach 10 real users. Test checks, failures and the stop control.'),('3','Grow','Reach 30 real users and try for the first euro. Record repeat use and manual work.'),('4','Prove it','Learn from feedback. Test a change. Prove your numbers and rehearse the demo.')]
for n,title,body in weeks:
 c.setStrokeColor(line);c.line(margin,y-2,W-margin,y-2);y-=22
 text(margin,y,n,15,green,'Helvetica-Bold');text(margin+28,y,title,11,ink,'Helvetica-Bold')
 y=para(body,margin+28,y-7,W-2*margin-28,9.6,soft)-9
y-=12;text(margin,y,'SIX THINGS TO SHOW',10,green,'Helvetica-Bold');y-=17
rules=[('Real users','People outside the team use it every week, or pay.'),('Runs without you','The recurring routine works daily; each request is handled once.'),('Checks first','Show a specific check and a result it stopped.'),('Handles failure','Show a safe retry, stop or human escalation.'),('You stay in control','Show results, cost, human minutes and a working stop control.'),('Improves from feedback','Compare one change on the same saved test cases; keep it only if better.')]
for title,body in rules:
 y=para('<b>'+title+'.</b> '+body,margin,y,W-2*margin,9.6,ink)-6
y-=12
c.setFillColor(HexColor('#e4eed9'));c.roundRect(margin,y-67,W-2*margin,68,7,fill=1,stroke=0)
para('<b>Evidence targets</b><br/>30+ users outside the team, or 3 paying customers. At least 2 weeks running daily on its own. People return week by week. Record cost and human work.',margin+13,y-10,W-2*margin-26,10,ink)
y-=88;text(margin,y,'JOIN & SUPPORT',10,green,'Helvetica-Bold');y-=12
y=para('Teams form <b>Thu 15 October</b>. Bring your six-line brief and a plan to reach five real users. Final demo: at the end of the course project; <b>SSE sets the date</b>. AI tool budget for up to 3 teams, with terms confirmed by Danielius.',margin,y,W-2*margin-88,9.5,soft)
q=QrCodeWidget('https://xndanius.github.io/autonomous-business-lab/');d=Drawing(73,73);b=q.getBounds();d.add(q);d.scale(73/(b[2]-b[0]),73/(b[3]-b[1]));renderPDF.draw(d,c,W-margin-76,y-4)
y=para('Questions: <link href="mailto:danielius.stasiulis@gmail.com" color="#416b26">danielius.stasiulis@gmail.com</link>',margin,y-10,W-2*margin-88,9.5,soft)
assert y>55, y
c.setStrokeColor(line);c.line(margin,47,W-margin,47)
para('<link href="https://xndanius.github.io/autonomous-business-lab/" color="#416b26">xndanius.github.io/autonomous-business-lab</link>  |  Slides, class ideas, build guide and templates',margin,36,W-2*margin,8,soft)
c.showPage();c.save();print(out)
