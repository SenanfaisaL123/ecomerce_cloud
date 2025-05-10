"use client"

import { useState, useEffect } from "react"
import { useAuth } from "../contexts/AuthContext"
import api from "../services/api"
import toast from "react-hot-toast"

const Profile = () => {
  const { currentUser, logout } = useAuth()
  const [productCount, setProductCount] = useState(0)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    const fetchUserData = async () => {
      try {
        const response = await api.get("/user/products")
        setProductCount(response.data.length)
      } catch (error) {
        console.error("Error fetching user data:", error)
      } finally {
        setLoading(false)
      }
    }

    fetchUserData()
  }, [])

  const handleLogout = () => {
    logout()
    toast.success("Logged out successfully")
  }

  if (loading) {
    return (
      <div className="flex justify-center items-center h-64">
        <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-emerald-500"></div>
      </div>
    )
  }

  return (
    <div className="max-w-3xl mx-auto">
      <h1 className="text-3xl font-bold text-gray-800 mb-6">My Profile</h1>

      <div className="bg-white rounded-lg shadow-md overflow-hidden">
        <div className="bg-emerald-600 text-white p-6">
          <div className="flex items-center">
            <div className="bg-white text-emerald-600 rounded-full h-16 w-16 flex items-center justify-center text-2xl font-bold">
              {currentUser?.username.charAt(0).toUpperCase()}
            </div>
            <div className="ml-4">
              <h2 className="text-2xl font-bold">{currentUser?.username}</h2>
              <p className="text-emerald-100">{currentUser?.email}</p>
            </div>
          </div>
        </div>

        <div className="p-6">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-6">
            <div className="bg-gray-50 p-4 rounded-lg">
              <h3 className="text-lg font-semibold text-gray-800 mb-2">Account Details</h3>
              <div className="space-y-2">
                <p className="text-gray-600">
                  <span className="font-medium">Username:</span> {currentUser?.username}
                </p>
                <p className="text-gray-600">
                  <span className="font-medium">Email:</span> {currentUser?.email}
                </p>
                <p className="text-gray-600">
                  <span className="font-medium">Member Since:</span>{" "}
                  {new Date(currentUser?.created_at).toLocaleDateString()}
                </p>
              </div>
            </div>

            <div className="bg-gray-50 p-4 rounded-lg">
              <h3 className="text-lg font-semibold text-gray-800 mb-2">Activity</h3>
              <div className="space-y-2">
                <p className="text-gray-600">
                  <span className="font-medium">Products Listed:</span> {productCount}
                </p>
              </div>
            </div>
          </div>

          <div className="flex justify-end">
            <button
              onClick={handleLogout}
              className="bg-red-600 text-white py-2 px-6 rounded-lg hover:bg-red-700 transition"
            >
              Logout
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}

export default Profile
