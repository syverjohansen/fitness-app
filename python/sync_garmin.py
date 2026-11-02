#!/usr/bin/env python3
"""Download original FIT files from Garmin Connect, speaking JSON lines on stdout."""
import argparse, io, json, os, sys, zipfile
from datetime import date
from pathlib import Path

def emit(kind, **data):
    print(json.dumps({"type": kind, **data}), flush=True)

def main():
    p=argparse.ArgumentParser()
    p.add_argument('--tokens',required=True);p.add_argument('--out',required=True);p.add_argument('--since',required=True)
    p.add_argument('--known',nargs='*',default=[]);p.add_argument('--email',default='')
    a=p.parse_args();tokens=Path(a.tokens);out=Path(a.out);tokens.mkdir(parents=True,exist_ok=True);out.mkdir(parents=True,exist_ok=True)
    try:
        from garminconnect import Garmin
    except ImportError:
        raise RuntimeError(f'garminconnect is not installed. Run: {sys.executable} -m pip install garminconnect')
    password=os.environ.pop('RUNNING_LOG_GARMIN_PASSWORD','')
    def mfa():
        emit('mfa_required');return sys.stdin.readline().strip()
    emit('progress',message='Signing in to Garmin…')
    token_file=tokens/'garmin_tokens.json'
    if token_file.exists(): client=Garmin();client.login(str(tokens))
    else:
        if not a.email or not password: raise RuntimeError('Garmin email and password are required for first sign-in. The password is never stored.')
        client=Garmin(a.email,password,prompt_mfa=mfa);client.login(str(tokens))
    activities=client.get_activities_by_date(a.since,date.today().isoformat())
    fresh=[x for x in activities if x.get('activityId') and str(x.get('activityId')) not in set(a.known)]
    skipped=0
    for i,x in enumerate(fresh,1):
        aid=str(x['activityId']);emit('progress',message=f'Downloading {i} of {len(fresh)}',current=i,total=len(fresh))
        try:
            target=out/f'{aid}.fit'
            if target.exists():
                emit('activity',id=aid,file=str(target),name=x.get('activityName','Garmin activity'),type_key=(x.get('activityType') or {}).get('typeKey'),start_local=x.get('startTimeLocal'))
                continue
            payload=client.download_activity(aid,dl_fmt=Garmin.ActivityDownloadFormat.ORIGINAL)
            if zipfile.is_zipfile(io.BytesIO(payload)):
                with zipfile.ZipFile(io.BytesIO(payload)) as z:
                    fit=next((n for n in z.namelist() if n.lower().endswith('.fit')),None)
                    if not fit: raise RuntimeError(f'Original download did not contain a FIT file')
                    target.write_bytes(z.read(fit))
            else: target.write_bytes(payload)
            emit('activity',id=aid,file=str(target),name=x.get('activityName','Garmin activity'),type_key=(x.get('activityType') or {}).get('typeKey'),start_local=x.get('startTimeLocal'))
        except Exception as e:
            skipped+=1;emit('activity_skipped',id=aid,name=x.get('activityName','Garmin activity'),message=str(e))
    emit('done',count=len(fresh)-skipped,skipped=skipped)

if __name__=='__main__':
    try: main()
    except Exception as e: emit('error',message=str(e));sys.exit(1)
