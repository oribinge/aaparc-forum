'use client';

import React, { useState, useEffect } from 'react';
// Adjust this import path if your lib folder is somewhere else!
import { supabase } from '../../lib/supabase'; 

// --- Helper: Format Date ---
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

// --- Types ---
type Comment = {
  id: string;
  post_id: string;
  content: string;
  created_at: string;
};

type Post = {
  id: string;
  author: string;
  category: string;
  content: string;
  created_at: string;
  comments: Comment[];
};

export default function AdminDashboard() {
  const [posts, setPosts] = useState<Post[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  
  // --- Admin Auth State ---
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [passcode, setPasscode] = useState('');
  const [error, setError] = useState('');

  // The secret passcode for the admin panel
  const ADMIN_PASSCODE = 'AAPARC2026';

  useEffect(() => {
    if (isAuthenticated) {
      fetchPosts();
    }
  }, [isAuthenticated]);

  const fetchPosts = async () => {
    setIsLoading(true);
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

  const handleLogin = (e: React.FormEvent) => {
    e.preventDefault();
    if (passcode === ADMIN_PASSCODE) {
      setIsAuthenticated(true);
      setError('');
    } else {
      setError('Incorrect passcode. Access denied.');
      setPasscode('');
    }
  };

  // --- Deletion Logic ---
  const handleDeletePost = async (postId: string) => {
    const confirmDelete = window.confirm("Are you sure you want to permanently delete this suggestion and all its comments?");
    if (!confirmDelete) return;

    // First delete associated comments to prevent foreign key errors
    await supabase.from('comments').delete().eq('post_id', postId);
    // Then delete the post itself
    const { error } = await supabase.from('posts').delete().eq('id', postId);
    
    if (!error) {
      setPosts(posts.filter(p => p.id !== postId));
    } else {
      alert("Error deleting post. Check Supabase RLS policies.");
    }
  };

  const handleDeleteComment = async (postId: string, commentId: string) => {
    const confirmDelete = window.confirm("Delete this comment?");
    if (!confirmDelete) return;

    const { error } = await supabase.from('comments').delete().eq('id', commentId);
    
    if (!error) {
      setPosts(posts.map(p => {
        if (p.id === postId) {
          return { ...p, comments: p.comments.filter(c => c.id !== commentId) };
        }
        return p;
      }));
    } else {
      alert("Error deleting comment. Check Supabase RLS policies.");
    }
  };

  // --- UI: LOGIN SCREEN ---
  if (!isAuthenticated) {
    return (
      <div className="min-h-screen bg-[#f1f5f9] flex flex-col items-center justify-center p-4">
        <div className="bg-white p-8 border border-slate-300 shadow-md max-w-md w-full text-center">
          <img src="/Arunachal_Pradesh_Seal.png" alt="Seal" className="w-20 h-20 mx-auto mb-4" />
          <h1 className="text-2xl font-extrabold text-[#003366] uppercase tracking-wide mb-2">Admin Access</h1>
          <p className="text-sm text-slate-500 mb-6">Enter your credentials to access the moderation portal.</p>
          
          <form onSubmit={handleLogin} className="space-y-4">
            <input 
              type="password" 
              placeholder="Admin Passcode"
              className="w-full bg-slate-50 border border-slate-300 p-3 text-center outline-none focus:border-[#003366]"
              value={passcode}
              onChange={(e) => setPasscode(e.target.value)}
            />
            {error && <p className="text-rose-600 text-sm font-bold">{error}</p>}
            <button type="submit" className="w-full bg-[#003366] hover:bg-blue-800 text-white font-bold py-3 uppercase tracking-wider transition-colors">
              Verify Identity
            </button>
          </form>
        </div>
      </div>
    );
  }

  // --- UI: ADMIN DASHBOARD ---
  return (
    <div className="min-h-screen bg-[#f1f5f9] text-slate-900 font-sans pb-10">
      <div className="h-1.5 w-full bg-gradient-to-r from-orange-500 via-white to-green-600"></div>
      
      <header className="bg-white border-b-2 border-blue-900 shadow-sm sticky top-0 z-10 px-4 py-4 flex justify-between items-center">
        <div className="flex items-center gap-3">
          <img src="/Arunachal_Pradesh_Seal.svg.png" alt="Seal" className="w-12 h-12" />
          <div>
            <h1 className="text-xl font-extrabold text-[#003366] uppercase tracking-wide">AAPARC Control Panel</h1>
            <p className="text-xs font-bold text-rose-600">MODERATOR MODE ACTIVE</p>
          </div>
        </div>
        <button onClick={() => setIsAuthenticated(false)} className="text-sm font-bold text-slate-500 hover:text-[#003366] border border-slate-300 px-3 py-1">
          LOGOUT
        </button>
      </header>

      <main className="max-w-5xl mx-auto px-4 mt-8">
        <div className="bg-[#003366] px-5 py-3 mb-4 flex justify-between items-center">
          <h2 className="text-white font-semibold uppercase tracking-wider text-sm">Manage Public Submissions</h2>
          <span className="text-white text-sm font-bold bg-blue-800 px-2 py-1 rounded">{posts.length} Total Records</span>
        </div>

        {isLoading ? (
          <div className="text-center py-10">Loading records...</div>
        ) : (
          <div className="space-y-6">
            {posts.map(post => (
              <div key={post.id} className="bg-white border border-slate-300 shadow-sm p-5 relative">
                
                {/* Delete Post Button */}
                <button 
                  onClick={() => handleDeletePost(post.id)}
                  className="absolute top-4 right-4 bg-rose-100 hover:bg-rose-600 hover:text-white text-rose-700 text-xs font-bold px-3 py-1.5 transition-colors uppercase border border-rose-200"
                >
                  Delete Post
                </button>

                <div className="mb-4 pr-32">
                  <span className="text-[10px] font-extrabold uppercase tracking-widest text-slate-500 bg-slate-100 px-2 py-1 mr-2 border border-slate-200">
                    {post.category}
                  </span>
                  <span className="text-xs text-slate-500">{formatRelativeTime(post.created_at)}</span>
                  <p className="mt-3 text-slate-800 font-medium whitespace-pre-wrap">{post.content}</p>
                </div>

                {/* Moderation for Comments */}
                {post.comments.length > 0 && (
                  <div className="mt-4 pt-4 border-t border-slate-200">
                    <h4 className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-3">Associated Comments</h4>
                    <div className="space-y-2">
                      {post.comments.map(comment => (
                        <div key={comment.id} className="bg-slate-50 border border-slate-200 p-3 flex justify-between items-center gap-4">
                          <p className="text-sm text-slate-700 truncate flex-1">{comment.content}</p>
                          <button 
                            onClick={() => handleDeleteComment(post.id, comment.id)}
                            className="text-[10px] font-bold text-rose-600 hover:bg-rose-100 px-2 py-1 uppercase border border-rose-200 transition-colors"
                          >
                            Delete
                          </button>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

              </div>
            ))}
          </div>
        )}
      </main>
    </div>
  );
}