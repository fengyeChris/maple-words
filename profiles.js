const LOCAL_PROFILE = 'local-user';

// Older versions generated an anonymous local-* profile in every browser.
// Merge their history once; registered profiles always remain separate.
function mergeAnonymousProfiles(original) {
  const registered = new Set((original.users || []).map(u=>u.id));
  const legacy = id => typeof id==='string' && id!==LOCAL_PROFILE && /^local-[a-z0-9]+$/i.test(id) && !registered.has(id);
  const progressOwner = (key,item) => item.user || key.split(':').slice(0,-2).join(':');
  const actionOwner = (key,item) => item.user || key.split(':').slice(0,-1).join(':');
  const ids = new Set();
  for(const [key,item] of Object.entries(original.progress || {})) if(legacy(progressOwner(key,item))) ids.add(progressOwner(key,item));
  for(const [key,item] of Object.entries(original.actions || {})) if(legacy(actionOwner(key,item))) ids.add(actionOwner(key,item));
  for(const item of original.books || []) if(legacy(item.user)) ids.add(item.user);
  if(!ids.size) return {state:original,mergedProfiles:0};

  const state = JSON.parse(JSON.stringify(original));
  const order = entries => entries.sort((a,b)=>(a[1].updatedAt || 0)-(b[1].updatedAt || 0));
  state.progress = {};
  for(const [key,item] of order(Object.entries(original.progress || {}))) {
    const owner=progressOwner(key,item);
    if(owner!==LOCAL_PROFILE && !legacy(owner)){state.progress[key]=item;continue;}
    const target=LOCAL_PROFILE+':'+key.split(':').slice(-2).join(':');
    const previous=state.progress[target] || {};
    state.progress[target]={...previous,...item,user:LOCAL_PROFILE,
      studied_ids:[...new Set([...(previous.studied_ids || []),...(item.studied_ids || [])])],
      days:[...new Set([...(previous.days || []),...(item.days || [])])].sort()};
  }
  state.actions = {};
  for(const [key,item] of order(Object.entries(original.actions || {}))) {
    const owner=actionOwner(key,item);
    if(owner!==LOCAL_PROFILE && !legacy(owner)){state.actions[key]=item;continue;}
    const target=LOCAL_PROFILE+':'+key.split(':').at(-1),previous=state.actions[target] || {};
    // Preserve flags from both browser histories during this one-time merge.
    state.actions[target]={...previous,...item,user:LOCAL_PROFILE,
      favorite:!!(previous.favorite || item.favorite),
      fuzzy:!!(previous.fuzzy || item.fuzzy),unknown:!!(previous.unknown || item.unknown)};
  }
  state.books=(original.books || []).map(item=>legacy(item.user) ? {...item,user:LOCAL_PROFILE} : item);
  return {state,mergedProfiles:ids.size};
}

function profileFromHeader(value,users) {
  if(!value) return LOCAL_PROFILE;
  if((users || []).some(user=>user.id===value)) return value;
  return /^local-[a-z0-9]+$/i.test(value) ? LOCAL_PROFILE : value;
}
module.exports={LOCAL_PROFILE,mergeAnonymousProfiles,profileFromHeader};
