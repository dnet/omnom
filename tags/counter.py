import pymongo

conn = pymongo.Connection()
db=conn.tagger
bm=db.bookmarks
misc=db.misc

def find_and_modify(query={}, update=None, upsert=False, **kwargs):
    if (not update and not kwargs.get('remove', None)):
        raise ValueError("Must either update or remove")

    if (update and kwargs.get('remove', None)):
        raise ValueError("Can't do both update and remove")

    # No need to include empty args
    if query: kwargs['query'] = query
    if update: kwargs['update'] = update
    if upsert: kwargs['upsert'] = upsert

    no_obj_error = "No matching object found"

    out = db.command("findAndModify", 'misc',
                     allowable_errors=[no_obj_error], **kwargs)

    if not out['ok']:
        if out["errmsg"] == no_obj_error:
            return None
        else:
            # Should never get here b/c of allowable_errors
            raise ValueError("Unexpected Error: %s"%out)
    return out['value']

def getNextVal(counterName='seq'):
    ret = find_and_modify(
        query={'_id': counterName},
        update={'$inc': {'val': 1}},
        upsert=True,
        new=True,
        )
    return int(ret['val'])

if __name__ == "__main__":
    i=0
    for item in bm.find({'seq' : { '$exists' : True }}):
        seq=item['seq']['val']
        bm.update({"_id": item['_id']}, {"$set": {"seq": seq}})
        i+=1
    print i,'updated'
