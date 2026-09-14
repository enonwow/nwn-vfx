"""Read-only comparison against the stopped pre-upgrade SQLite snapshot."""
import hashlib,json,sqlite3
from pathlib import Path

root=Path('output/beam-multistrand-0282').resolve()
lab=Path('output/beam-composite-0281/lab').resolve()
before=sqlite3.connect((root/'pre-upgrade/studio.sqlite').as_uri()+'?mode=ro',uri=True)
after=sqlite3.connect((lab/'data/studio.sqlite').as_uri()+'?mode=ro',uri=True)
assert after.execute('pragma integrity_check').fetchone()[0]=='ok'
tables={row[0] for row in before.execute("select name from sqlite_master where type='table'")}
checks={}
for table in ['projects','revisions','jobs','artifacts','external_reports']:
    assert table in tables,(table,sorted(tables))
    # All accepted original rows must remain byte/value-identical. New fixtures are allowed.
    old=before.execute('select * from '+table).fetchall()
    current=set(after.execute('select * from '+table).fetchall())
    assert all(row in current for row in old),table
    checks[table]={'originalRows':len(old),'currentRows':len(current),'allOriginalRowsUnchanged':True}
files=json.loads((root/'pre-upgrade/files.json').read_text(encoding='utf-8-sig'))
for entry in files:
    relative=Path(entry['path'])
    path=(lab/'data'/relative) if relative.parts[0]=='artifacts' else lab/relative
    data=path.read_bytes()
    assert len(data)==entry['size'] and hashlib.sha256(data).hexdigest()==entry['sha256'],entry['path']
report={'sqliteIntegrity':'ok','tables':checks,'originalFilesUnchanged':len(files),'readOnly':True}
(root/'preservation.json').write_text(json.dumps(report,indent=2)+'\n',encoding='utf-8')
print(json.dumps(report,indent=2))
