'use client';

import React, { useState, useEffect, useRef } from 'react';
import { supabase } from '../lib/supabase'; 

// --- Helper: Format Date ---
const formatRelativeTime = (isoString: string) => {
  const date = new Date(isoString);
  return new Intl.DateTimeFormat('en-US', {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  }).format(date);
};

// --- Types ---
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
  upvotes: number; // Treated as Likes
  downvotes: number; // Treated as Dislikes
  comments: Comment[];
  media_url?: string;
  media_type?: string;
};

// --- CATEGORIES ---
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

    const { data } = await supabase.from('posts').insert([{
      author: 'Citizen', 
      category: selectedCategory,
      content: newPostContent,
      media_url: mediaUrl,
      media_type: mediaType,
    }]).select();

    if (data) {
      setPosts([{ ...data[0], comments: [] }, ...posts]); 
      setNewPostContent('');
      setSelectedFile(null);
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
    <div className="min-h-screen bg-slate-50 text-slate-900 font-sans selection:bg-indigo-500/30">
      
      {/* HEADER WITH OFFICIAL SEAL */}
      <header className="border-b border-slate-200 bg-white sticky top-0 z-10 shadow-sm">
        <div className="max-w-2xl mx-auto px-4 py-5 flex items-center gap-4 sm:gap-6">
          
          <div className="flex-shrink-0">
            {/* UPDATED IMAGE SOURCE */}
            <img 
              src="/Arunachal_Pradesh_Seal.svg.png" 
              alt="Seal of Arunachal Pradesh" 
              className="w-16 h-16 sm:w-20 sm:h-20 object-contain drop-shadow-sm"
            />
          </div>

          <div className="flex flex-col text-left">
            <h1 className="text-2xl sm:text-3xl font-bold text-slate-800 tracking-tight">
              AAPARC Public Forum
            </h1>
            <p className="text-xs sm:text-sm text-slate-500 mt-1 leading-relaxed">
              Share your ideas and feedback for administrative reforms in Arunachal Pradesh.
            </p>
          </div>

        </div>
      </header>

      <main className="max-w-2xl mx-auto px-4 py-8 space-y-8">
        
        {/* SUBMIT SUGGESTION FORM */}
        <section className="bg-white border border-slate-200 rounded-xl p-5 shadow-sm">
          <form onSubmit={handlePostSubmit}>
            <textarea
              className="w-full bg-slate-50 text-slate-900 border border-slate-200 rounded-lg p-4 outline-none focus:border-indigo-500 transition-colors resize-none placeholder:text-slate-400"
              rows={4}
              placeholder="Detail your idea for improving public administration, transparency, or service delivery..."
              value={newPostContent}
              onChange={(e) => setNewPostContent(e.target.value)}
            />
            
            {selectedFile && (
              <div className="mt-3 bg-slate-100 text-sm px-3 py-2 rounded-md flex justify-between items-center border border-slate-200">
                <span className="truncate text-slate-700">📎 {selectedFile.name}</span>
                <button type="button" onClick={() => setSelectedFile(null)} className="text-rose-500 hover:text-rose-600 font-medium">
                  Remove
                </button>
              </div>
            )}

            <div className="flex flex-wrap items-center justify-between gap-4 mt-4">
              <div className="flex items-center gap-3 w-full sm:w-auto">
                <select 
                  className="bg-white border border-slate-200 text-slate-700 text-sm rounded-lg px-3 py-2 outline-none focus:border-indigo-500 max-w-[200px]"
                  value={selectedCategory}
                  onChange={(e) => setSelectedCategory(e.target.value)}
                >
                  {CATEGORIES.map(cat => (
                    <option key={cat} value={cat}>{cat}</option>
                  ))}
                </select>

                <input type="file" ref={fileInputRef} onChange={handleFileChange} className="hidden" accept="image/*,video/*,audio/*,application/pdf" />
                <button type="button" onClick={() => fileInputRef.current?.click()} className="bg-slate-100 hover:bg-slate-200 text-slate-700 px-3 py-2 rounded-lg text-sm transition-colors border border-slate-200">
                  📎 Attach Media
                </button>
              </div>

              <button 
                type="submit"
                disabled={(!newPostContent.trim() && !selectedFile) || isUploading}
                className="w-full sm:w-auto bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 text-white px-5 py-2 rounded-lg font-medium transition-colors"
              >
                {isUploading ? 'Submitting...' : 'Submit to AAPARC'}
              </button>
            </div>
          </form>
        </section>

        {/* FEED SECTION */}
        <section className="space-y-6">
          {isLoading ? (
            <div className="text-center text-slate-500 py-10">Loading citizen suggestions...</div>
          ) : posts.length === 0 ? (
            <div className="text-center text-slate-500 py-10">No public suggestions yet. Be the first to share your ideas for reform!</div>
          ) : (
            posts.map(post => (
              <article key={post.id} className="bg-white border border-slate-200 rounded-xl p-5 shadow-sm">
                
                <div className="flex items-center justify-between mb-3">
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-semibold uppercase tracking-wider text-indigo-700 bg-indigo-50 px-2 py-1 rounded border border-indigo-100">
                      {post.category}
                    </span>
                    <span className="text-sm font-medium text-slate-600">{post.author}</span>
                  </div>
                  <span className="text-xs text-slate-400">{formatRelativeTime(post.created_at)}</span>
                </div>

                <p className="text-slate-800 text-lg leading-relaxed mb-4 whitespace-pre-wrap">{post.content}</p>

                {post.media_url && post.media_type === 'image' && <img src={post.media_url} alt="Citizen upload" className="w-full max-h-[500px] object-cover rounded-lg mb-4 border border-slate-200" />}
                {post.media_url && post.media_type === 'video' && <video src={post.media_url} controls className="w-full max-h-[500px] rounded-lg mb-4 border border-slate-200" />}
                {post.media_url && post.media_type === 'audio' && <audio src={post.media_url} controls className="w-full mb-4 outline-none" />}

                {/* LIKE / DISLIKE BUTTONS */}
                <div className="flex items-center gap-4 border-t border-slate-100 pt-4">
                  
                  <div className="flex items-center gap-2">
                    <button 
                      onClick={() => handleVote(post, 'up')} 
                      className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full border transition-colors ${
                        userVotes[post.id] === 'up' 
                          ? 'bg-indigo-50 border-indigo-200 text-indigo-700' 
                          : 'bg-slate-50 border-slate-200 text-slate-600 hover:bg-slate-100'
                      }`}
                    >
                      👍 <span className="text-sm font-medium">{post.upvotes}</span>
                    </button>
                    
                    <button 
                      onClick={() => handleVote(post, 'down')} 
                      className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full border transition-colors ${
                        userVotes[post.id] === 'down' 
                          ? 'bg-rose-50 border-rose-200 text-rose-700' 
                          : 'bg-slate-50 border-slate-200 text-slate-600 hover:bg-slate-100'
                      }`}
                    >
                      👎 <span className="text-sm font-medium">{post.downvotes}</span>
                    </button>
                  </div>
                  
                  <button onClick={() => toggleComments(post.id)} className="flex items-center gap-2 text-sm font-medium text-slate-500 hover:text-indigo-600 transition-colors ml-auto">
                    💬 {post.comments.length} Discussion
                  </button>
                </div>

                {/* COMMENTS SECTION */}
                {expandedPosts.has(post.id) && (
                  <div className="mt-5 pt-5 border-t border-slate-100 space-y-4">
                    
                    <div className="space-y-3">
                      {post.comments.map(comment => (
                        <div key={comment.id} className="bg-slate-50 border border-slate-100 rounded-lg p-3">
                          <div className="flex justify-between items-start mb-2">
                            <p className="text-slate-700 text-sm whitespace-pre-wrap">{comment.content}</p>
                            <span className="text-[10px] text-slate-400 ml-2 whitespace-nowrap">{formatRelativeTime(comment.created_at)}</span>
                          </div>
                          <button 
                            onClick={() => handleCommentLike(post.id, comment.id, comment.likes)}
                            className={`text-xs font-medium flex items-center gap-1 transition-colors ${likedComments.has(comment.id) ? 'text-indigo-600' : 'text-slate-400 hover:text-indigo-600'}`}
                          >
                            👍 {comment.likes}
                          </button>
                        </div>
                      ))}
                    </div>

                    <div className="flex gap-2">
                      <input 
                        type="text"
                        placeholder="Add to the discussion..."
                        className="flex-1 bg-white border border-slate-200 rounded-lg px-4 py-2 text-sm text-slate-800 outline-none focus:border-indigo-500 transition-colors"
                        value={commentInputs[post.id] || ''}
                        onChange={(e) => setCommentInputs({ ...commentInputs, [post.id]: e.target.value })}
                        onKeyDown={(e) => { if (e.key === 'Enter') handleAddComment(post.id); }}
                      />
                      <button 
                        onClick={() => handleAddComment(post.id)}
                        disabled={!commentInputs[post.id]?.trim()}
                        className="bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 text-white px-4 py-2 rounded-lg text-sm font-medium transition-colors"
                      >
                        Send
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