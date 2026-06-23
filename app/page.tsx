'use client';

import React, { useState, useEffect, useRef } from 'react';
import { supabase } from '../lib/supabase'; 

// --- Helper: Format Date & Time ---
const formatRelativeTime = (isoString: string) => {
  const date = new Date(isoString);
  return new Intl.DateTimeFormat('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  }).format(date);
};

type Comment = {
  id: string;
  post_id: string;
  content: string;
  likes: number;
  created_at: string;
};

type Post = {
  id: string;
  author: string;
  category: string;
  content: string;
  created_at: string;
  upvotes: number; 
  downvotes: number; 
  comments: Comment[];
  media_url?: string;
  media_type?: string;
  contact_name?: string;
};

const CATEGORIES = [
  'Public Service Delivery', 
  'Governance & Transparency', 
  'Policy Reform', 
  'Digital Initiative', 
  'Infrastructure', 
  'General Feedback'
];

export default function SuggestionsBoard() {
  const [posts, setPosts] = useState<Post[]>([]);
  const [newPostContent, setNewPostContent] = useState('');
  const [selectedCategory, setSelectedCategory] = useState(CATEGORIES[0]);
  const [isLoading, setIsLoading] = useState(true);
  
  // --- NEW: Contact Info States ---
  const [isAnonymous, setIsAnonymous] = useState(true);
  const [contactName, setContactName] = useState('');
  const [contactEmail, setContactEmail] = useState('');
  const [contactPhone, setContactPhone] = useState('');

  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [isUploading, setIsUploading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [expandedPosts, setExpandedPosts] = useState<Set<string>>(new Set());
  const [commentInputs, setCommentInputs] = useState<Record<string, string>>({});
  const [likedComments, setLikedComments] = useState<Set<string>>(new Set());
  const [userVotes, setUserVotes] = useState<Record<string, 'up' | 'down'>>({});

  useEffect(() => {
    fetchPosts();
  }, []);

  const fetchPosts = async () => {
    const { data, error } = await supabase
      .from('posts')
      .select('*, comments (*)')
      .order('created_at', { ascending: false });

    if (data) {
      const formattedData = data.map((post: any) => ({
        ...post,
        comments: post.comments ? post.comments.sort((a: Comment, b: Comment) => 
          new Date(a.created_at).getTime() - new Date(b.created_at).getTime()
        ) : []
      }));
      setPosts(formattedData);
    }
    setIsLoading(false);
  };

  const handlePostSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newPostContent.trim() && !selectedFile) return;
    setIsUploading(true);

    let mediaUrl = null;
    let mediaType = null;

    if (selectedFile) {
      const fileExt = selectedFile.name.split('.').pop();
      const fileName = `${Math.random()}.${fileExt}`;
      await supabase.storage.from('media').upload(fileName, selectedFile);
      const { data } = supabase.storage.from('media').getPublicUrl(fileName);
      mediaUrl = data.publicUrl;
      mediaType = selectedFile.type.split('/')[0];
    }

    // Determine the public author name. 
    // If they provided a name, show it! Otherwise, stay anonymous.
    const publicAuthorName = isAnonymous ? 'Anonymous Citizen' : (contactName.trim() || 'Citizen');

    const { data } = await supabase.from('posts').insert([{
      author: publicAuthorName, 
      category: selectedCategory,
      content: newPostContent,
      media_url: mediaUrl,
      media_type: mediaType,
      contact_name: isAnonymous ? null : contactName,
      contact_email: isAnonymous ? null : contactEmail,
      contact_phone: isAnonymous ? null : contactPhone
    }]).select();

    if (data) {
      setPosts([{ ...data[0], comments: [] }, ...posts]); 
      setNewPostContent('');
      setSelectedFile(null);
      // Reset the form
      setContactName('');
      setContactEmail('');
      setContactPhone('');
      setIsAnonymous(true); 
    }
    setIsUploading(false);
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      if (e.target.files[0].size > 10 * 1024 * 1024) {
        alert("File is too large! Please select a file under 10MB.");
        return;
      }
      setSelectedFile(e.target.files[0]);
    }
  };

  const handleAddComment = async (postId: string) => {
    const text = commentInputs[postId];
    if (!text?.trim()) return;

    const { data } = await supabase.from('comments').insert([{ 
      post_id: postId, 
      content: text,
      created_at: new Date().toISOString()
    }]).select();

    if (data) {
      setPosts(posts.map(p => p.id === postId ? { ...p, comments: [...p.comments, data[0]] } : p));
      setCommentInputs({ ...commentInputs, [postId]: '' });
    }
  };

  const handleVote = async (post: Post, type: 'up' | 'down') => {
    const postId = post.id;
    const currentVote = userVotes[postId]; 

    let newUpvotes = post.upvotes;
    let newDownvotes = post.downvotes;
    const newUserVotes = { ...userVotes };

    if (currentVote === type) {
      if (type === 'up') newUpvotes -= 1;
      if (type === 'down') newDownvotes -= 1;
      delete newUserVotes[postId];
    } else if (currentVote) {
      if (type === 'up') {
        newUpvotes += 1;
        newDownvotes -= 1;
      } else {
        newUpvotes -= 1;
        newDownvotes += 1;
      }
      newUserVotes[postId] = type;
    } else {
      if (type === 'up') newUpvotes += 1;
      if (type === 'down') newDownvotes += 1;
      newUserVotes[postId] = type;
    }

    setUserVotes(newUserVotes);
    setPosts(posts.map(p => p.id === postId ? { ...p, upvotes: newUpvotes, downvotes: newDownvotes } : p));
    await supabase.from('posts').update({ upvotes: newUpvotes, downvotes: newDownvotes }).eq('id', postId);
  };

  const handleCommentLike = async (postId: string, commentId: string, currentLikes: number) => {
    const hasLiked = likedComments.has(commentId);
    const newLikes = hasLiked ? currentLikes - 1 : currentLikes + 1;
    
    const newLikedComments = new Set(likedComments);
    if (hasLiked) newLikedComments.delete(commentId);
    else newLikedComments.add(commentId);
    setLikedComments(newLikedComments);

    setPosts(posts.map(p => {
      if (p.id === postId) {
        return { ...p, comments: p.comments.map(c => c.id === commentId ? { ...c, likes: newLikes } : c) };
      }
      return p;
    }));

    await supabase.from('comments').update({ likes: newLikes }).eq('id', commentId);
  };

  const toggleComments = (postId: string) => {
    const newExpanded = new Set(expandedPosts);
    if (newExpanded.has(postId)) newExpanded.delete(postId);
    else newExpanded.add(postId);
    setExpandedPosts(newExpanded);
  };

  return (
    <div className="min-h-screen bg-[#f1f5f9] text-slate-900 font-sans">
      
      <div className="h-1.5 w-full bg-gradient-to-r from-orange-500 via-white to-green-600"></div>

      <header className="bg-white border-b-2 border-blue-900 shadow-sm sticky top-0 z-10">
        <div className="max-w-4xl mx-auto px-4 py-4 flex flex-col md:flex-row items-center gap-4 md:gap-6">
          <div className="flex-shrink-0">
            <img 
              src="/Arunachal_Pradesh_Seal.svg.png" 
              alt="Seal of Arunachal Pradesh" 
              className="w-16 h-16 md:w-20 md:h-20 object-contain drop-shadow-sm"
            />
          </div>
          <div className="text-center md:text-left">
            <h1 className="text-2xl md:text-3xl font-extrabold text-[#003366] uppercase tracking-wide">
              Arunachal Pradesh
            </h1>
            <h2 className="text-lg md:text-xl font-bold text-slate-800">
              Administrative Reforms Commission (APARC)
            </h2>
            <p className="text-sm text-slate-500 mt-1 font-medium">
              Public Suggestion & Feedback Portal
            </p>
          </div>
        </div>
      </header>

      <main className="max-w-4xl mx-auto px-4 py-8 space-y-10">
        
        {/* --- FORM SECTION --- */}
        <section className="bg-white border border-slate-300 shadow-sm">
          <div className="bg-[#003366] px-5 py-3">
            <h3 className="text-white font-semibold uppercase tracking-wider text-sm">
              Submit Official Feedback
            </h3>
          </div>
          
          <form onSubmit={handlePostSubmit} className="p-5">
            
            {/* NEW IDENTITY SECTION */}
            <div className="mb-6 bg-slate-50 border border-slate-200 p-4">
              <label className="block text-sm font-bold text-slate-700 mb-3 uppercase tracking-wider">Identity Preferences</label>
              <div className="flex flex-col sm:flex-row gap-4 mb-4">
                <label className="flex items-center gap-2 cursor-pointer bg-white border border-slate-300 px-4 py-2 hover:bg-slate-50 transition-colors">
                  <input 
                    type="radio" 
                    checked={isAnonymous} 
                    onChange={() => setIsAnonymous(true)} 
                    className="w-4 h-4 text-[#003366] accent-[#003366]" 
                  />
                  <span className="text-sm font-bold text-slate-800">Stay Anonymous</span>
                </label>
                <label className="flex items-center gap-2 cursor-pointer bg-white border border-slate-300 px-4 py-2 hover:bg-slate-50 transition-colors">
                  <input 
                    type="radio" 
                    checked={!isAnonymous} 
                    onChange={() => setIsAnonymous(false)} 
                    className="w-4 h-4 text-[#003366] accent-[#003366]" 
                  />
                  <span className="text-sm font-bold text-slate-800">Provide Contact Info (Optional)</span>
                </label>
              </div>

              {!isAnonymous && (
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4 animate-in fade-in slide-in-from-top-2 duration-300">
                  <div>
                    <label className="block text-xs font-bold text-slate-600 mb-1">Full Name</label>
                    <input 
                      type="text" 
                      placeholder="e.g. John Doe"
                      className="w-full bg-white border border-slate-300 p-2.5 text-sm outline-none focus:border-[#003366] focus:ring-1 focus:ring-[#003366]"
                      value={contactName}
                      onChange={(e) => setContactName(e.target.value)}
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-bold text-slate-600 mb-1">Email</label>
                    <input 
                      type="email" 
                      placeholder="e.g. citizen@gmail.com"
                      className="w-full bg-white border border-slate-300 p-2.5 text-sm outline-none focus:border-[#003366] focus:ring-1 focus:ring-[#003366]"
                      value={contactEmail}
                      onChange={(e) => setContactEmail(e.target.value)}
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-bold text-slate-600 mb-1">Phone Number</label>
                    <input 
                      type="tel" 
                      placeholder="+91"
                      className="w-full bg-white border border-slate-300 p-2.5 text-sm outline-none focus:border-[#003366] focus:ring-1 focus:ring-[#003366]"
                      value={contactPhone}
                      onChange={(e) => setContactPhone(e.target.value)}
                    />
                  </div>
                  <p className="md:col-span-3 text-[11px] text-slate-500 font-medium">
                    * Your Name will be displayed publicly, but your email and phone number will remain strictly confidential for APARC administrative use only.
                  </p>
                </div>
              )}
            </div>

            <label className="block text-sm font-bold text-slate-700 mb-2">Category of Reform</label>
            <select 
              className="w-full md:w-1/2 bg-slate-50 border border-slate-300 text-slate-800 text-sm p-2.5 mb-4 outline-none focus:border-[#003366] focus:ring-1 focus:ring-[#003366] transition-all"
              value={selectedCategory}
              onChange={(e) => setSelectedCategory(e.target.value)}
            >
              {CATEGORIES.map(cat => (
                <option key={cat} value={cat}>{cat}</option>
              ))}
            </select>

            <label className="block text-sm font-bold text-slate-700 mb-2">Detailed Suggestion</label>
            <textarea
              className="w-full bg-slate-50 text-slate-900 border border-slate-300 p-4 outline-none focus:border-[#003366] focus:ring-1 focus:ring-[#003366] transition-all resize-none placeholder:text-slate-400"
              rows={5}
              placeholder="Detail your idea for improving public administration, transparency, or service delivery in Arunachal Pradesh..."
              value={newPostContent}
              onChange={(e) => setNewPostContent(e.target.value)}
            />
            
            {selectedFile && (
              <div className="mt-3 bg-blue-50 border border-blue-200 text-blue-800 text-sm px-4 py-2 flex justify-between items-center">
                <span className="truncate font-medium">📎 {selectedFile.name}</span>
                <button type="button" onClick={() => setSelectedFile(null)} className="text-rose-600 hover:text-rose-800 font-bold ml-4">
                  REMOVE
                </button>
              </div>
            )}

            <div className="flex flex-wrap items-center justify-between gap-4 mt-5 pt-4 border-t border-slate-200">
              <div className="flex items-center gap-3">
                <input type="file" ref={fileInputRef} onChange={handleFileChange} className="hidden" accept="image/*,video/*,audio/*,application/pdf" />
                <button type="button" onClick={() => fileInputRef.current?.click()} className="bg-slate-200 hover:bg-slate-300 text-slate-800 px-4 py-2 text-sm font-semibold transition-colors border border-slate-300 shadow-sm">
                  📎 Attach Document / Media
                </button>
              </div>

              <button 
                type="submit"
                disabled={(!newPostContent.trim() && !selectedFile) || isUploading}
                className="w-full sm:w-auto bg-[#003366] hover:bg-blue-800 disabled:opacity-50 text-white px-8 py-2.5 font-bold uppercase tracking-wider transition-colors shadow-sm"
              >
                {isUploading ? 'Submitting...' : 'Submit to Commission'}
              </button>
            </div>
          </form>
        </section>

        {/* --- PUBLIC FEED --- */}
        <section className="space-y-6">
          <div className="flex items-center gap-3 border-b-2 border-slate-300 pb-2">
            <h3 className="text-xl font-bold text-[#003366] uppercase tracking-wide">Public Submissions</h3>
            <span className="bg-slate-200 text-slate-700 text-xs font-bold px-2 py-1 rounded-full">{posts.length}</span>
          </div>

          {isLoading ? (
            <div className="text-center text-slate-500 py-10 font-medium">Retrieving records from database...</div>
          ) : posts.length === 0 ? (
            <div className="text-center text-slate-500 py-10 font-medium">No public suggestions have been submitted yet.</div>
          ) : (
            posts.map(post => (
              <article key={post.id} className="bg-white border border-slate-300 shadow-sm relative">
                
                <div className="bg-slate-100 border-b border-slate-200 px-5 py-3 flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                  <div className="flex items-center gap-3 flex-wrap">
                    <span className="text-[11px] font-extrabold uppercase tracking-widest text-white bg-[#003366] px-2.5 py-1">
                      {post.category}
                    </span>
                    <span className="text-sm font-bold text-slate-700">Submitted by: {post.author}</span>
                  </div>
                  {/* NEW: EXACT DATE AND TIME BADGE ON PUBLIC FEED */}
                  <span className="text-xs font-bold text-[#003366] bg-blue-50 px-2 py-1 border border-blue-100 flex items-center gap-1">
                    ⏱️ Uploaded: {formatRelativeTime(post.created_at)}
                  </span>
                </div>

                <div className="p-5">
                  <p className="text-slate-800 text-base leading-relaxed mb-5 whitespace-pre-wrap">{post.content}</p>

                  {/* MEDIA DISPLAY */}
                  {post.media_url && post.media_type === 'image' && <img src={post.media_url} alt="Attached Document" className="w-full max-h-[400px] object-cover border border-slate-300 p-1 mb-5" />}
                  {post.media_url && post.media_type === 'video' && <video src={post.media_url} controls className="w-full max-h-[400px] border border-slate-300 p-1 mb-5" />}
                  {post.media_url && post.media_type === 'audio' && <audio src={post.media_url} controls className="w-full mb-5" />}

                  <div className="flex items-center gap-4 pt-4 border-t border-slate-200">
                    <div className="flex items-center gap-3">
                      <button 
                        onClick={() => handleVote(post, 'up')} 
                        className={`flex items-center gap-1.5 px-3 py-1.5 border transition-all text-sm font-bold ${
                          userVotes[post.id] === 'up' 
                            ? 'bg-blue-50 border-[#003366] text-[#003366]' 
                            : 'bg-white border-slate-300 text-slate-600 hover:bg-slate-50'
                        }`}
                      >
                        👍 Endorse <span className="ml-1 bg-slate-200 text-slate-800 px-1.5 py-0.5 rounded text-xs">{post.upvotes}</span>
                      </button>
                      
                      <button 
                        onClick={() => handleVote(post, 'down')} 
                        className={`flex items-center gap-1.5 px-3 py-1.5 border transition-all text-sm font-bold ${
                          userVotes[post.id] === 'down' 
                            ? 'bg-rose-50 border-rose-600 text-rose-700' 
                            : 'bg-white border-slate-300 text-slate-600 hover:bg-slate-50'
                        }`}
                      >
                        👎 Object <span className="ml-1 bg-slate-200 text-slate-800 px-1.5 py-0.5 rounded text-xs">{post.downvotes}</span>
                      </button>
                    </div>
                    
                    <button onClick={() => toggleComments(post.id)} className="flex items-center gap-2 text-sm font-bold text-slate-500 hover:text-[#003366] transition-colors ml-auto uppercase tracking-wide">
                      💬 Discussion ({post.comments.length})
                    </button>
                  </div>
                </div>

                {/* COMMENTS SECTION */}
                {expandedPosts.has(post.id) && (
                  <div className="bg-slate-50 border-t border-slate-200 p-5 space-y-4">
                    
                    {post.comments.length > 0 && (
                      <div className="space-y-3">
                        {post.comments.map(comment => (
                          <div key={comment.id} className="bg-white border border-slate-300 p-4 relative">
                            <div className="flex justify-between items-start mb-2">
                              <p className="text-slate-800 text-sm whitespace-pre-wrap pr-20">{comment.content}</p>
                              <span className="text-[11px] text-slate-500 absolute top-4 right-4">{formatRelativeTime(comment.created_at)}</span>
                            </div>
                            <button 
                              onClick={() => handleCommentLike(post.id, comment.id, comment.likes)}
                              className={`text-xs font-bold flex items-center gap-1 transition-colors mt-2 ${
                                likedComments.has(comment.id) ? 'text-[#003366]' : 'text-slate-500 hover:text-[#003366]'
                              }`}
                            >
                              👍 Endorse ({comment.likes})
                            </button>
                          </div>
                        ))}
                      </div>
                    )}

                    <div className="flex flex-col sm:flex-row gap-2 pt-2">
                      <input 
                        type="text"
                        placeholder="Add a comment to the public record..."
                        className="flex-1 bg-white border border-slate-300 p-2.5 text-sm text-slate-900 outline-none focus:border-[#003366] focus:ring-1 focus:ring-[#003366]"
                        value={commentInputs[post.id] || ''}
                        onChange={(e) => setCommentInputs({ ...commentInputs, [post.id]: e.target.value })}
                        onKeyDown={(e) => { if (e.key === 'Enter') handleAddComment(post.id); }}
                      />
                      <button 
                        onClick={() => handleAddComment(post.id)}
                        disabled={!commentInputs[post.id]?.trim()}
                        className="bg-slate-700 hover:bg-slate-800 disabled:opacity-50 text-white px-6 py-2.5 text-sm font-bold uppercase tracking-wider transition-colors"
                      >
                        Submit
                      </button>
                    </div>

                  </div>
                )}
              </article>
            ))
          )}
        </section>
      </main>
    </div>
  );
}